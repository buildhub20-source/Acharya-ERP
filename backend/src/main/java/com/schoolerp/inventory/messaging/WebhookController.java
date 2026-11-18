package com.schoolerp.inventory.messaging;

import com.schoolerp.inventory.model.Enums.Channel;
import com.schoolerp.inventory.model.Enums.DeliveryState;
import com.schoolerp.inventory.model.Enums.QuoteSource;
import com.schoolerp.inventory.service.MessagingService;
import com.schoolerp.inventory.service.ProcurementService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.ObjectMapper;

/**
 * Provider callbacks. These must be reachable from the internet (deploy, or `ngrok http 8080` in dev)
 * and always answer 200 quickly, otherwise the provider keeps retrying.
 */
@RestController
@RequestMapping("/api/webhooks")
public class WebhookController {

    private static final Logger log = LoggerFactory.getLogger(WebhookController.class);

    private final InboundReplyService inbound;
    private final MessagingService messaging;
    private final ProcurementService procurement;
    private final ObjectMapper json;
    private final String waVerifyToken;
    private final String waAppSecret;
    private final String smsSigningKey;

    public WebhookController(InboundReplyService inbound, MessagingService messaging, ProcurementService procurement,
                             ObjectMapper json,
                             @Value("${app.whatsapp.verify-token:}") String waVerifyToken,
                             @Value("${app.whatsapp.app-secret:}") String waAppSecret,
                             @Value("${app.sms.signing-key:}") String smsSigningKey) {
        this.inbound = inbound;
        this.messaging = messaging;
        this.procurement = procurement;
        this.json = json;
        this.waVerifyToken = waVerifyToken;
        this.waAppSecret = waAppSecret;
        this.smsSigningKey = smsSigningKey;
    }

    // ------------------------------------------------------------------ WhatsApp Cloud API

    /** One-time subscription handshake from the Meta app dashboard. */
    @GetMapping("/whatsapp")
    public ResponseEntity<String> verifyWhatsApp(@RequestParam("hub.mode") String mode,
                                                 @RequestParam("hub.verify_token") String token,
                                                 @RequestParam("hub.challenge") String challenge) {
        if ("subscribe".equals(mode) && !waVerifyToken.isBlank() && waVerifyToken.equals(token)) {
            return ResponseEntity.ok(challenge);
        }
        return ResponseEntity.status(403).body("verify token mismatch");
    }

    @PostMapping("/whatsapp")
    public ResponseEntity<Void> whatsapp(@RequestBody byte[] raw,
                                         @RequestHeader(value = "X-Hub-Signature-256", required = false) String signature) {
        if (!waAppSecret.isBlank()) {
            String expected = "sha256=" + hmacHex(waAppSecret, raw);
            if (signature == null || !MessageDigest.isEqual(expected.getBytes(), signature.getBytes())) {
                log.warn("WhatsApp webhook rejected: bad signature");
                return ResponseEntity.status(401).build();
            }
        }
        try {
            Map<?, ?> root = json.readValue(raw, Map.class);
            for (Object entry : list(root.get("entry"))) {
                for (Object change : list(map(entry).get("changes"))) {
                    Map<?, ?> value = map(map(change).get("value"));
                    for (Object m : list(value.get("messages"))) whatsappMessage(map(m));
                    for (Object s : list(value.get("statuses"))) whatsappStatus(map(s));
                }
            }
        } catch (Exception e) {
            log.warn("WhatsApp webhook could not be processed: {}", e.getMessage());
        }
        return ResponseEntity.ok().build();
    }

    private void whatsappMessage(Map<?, ?> m) {
        String from = str(m.get("from"));
        String type = str(m.get("type"));
        String text;
        String attachment = null;
        QuoteSource source = QuoteSource.WHATSAPP_TEXT;
        switch (type == null ? "" : type) {
            case "text" -> text = str(map(m.get("text")).get("body"));
            case "document" -> {
                Map<?, ?> d = map(m.get("document"));
                text = str(d.get("caption"));
                attachment = d.get("filename") != null ? str(d.get("filename")) : "document";
                source = attachment.toLowerCase().endsWith(".pdf") ? QuoteSource.PDF : QuoteSource.IMAGE;
            }
            case "image" -> {
                text = str(map(m.get("image")).get("caption"));
                attachment = "whatsapp-image-" + m.get("id") + ".jpg";
                source = QuoteSource.IMAGE;
            }
            case "audio" -> {
                text = "";
                attachment = "whatsapp-voice-" + m.get("id") + ".ogg";
                source = QuoteSource.VOICE;
            }
            default -> text = "[" + type + " message]";
        }
        inbound.handle(Channel.WHATSAPP, from, null, text == null ? "" : text, source, attachment, str(m.get("id")));
    }

    private void whatsappStatus(Map<?, ?> s) {
        DeliveryState state = switch (String.valueOf(s.get("status"))) {
            case "delivered" -> DeliveryState.DELIVERED;
            case "read" -> DeliveryState.READ;
            case "failed" -> DeliveryState.FAILED;
            default -> null;
        };
        if (state == null) return;
        String error = null;
        List<?> errors = list(s.get("errors"));
        if (!errors.isEmpty()) {
            Map<?, ?> e = map(errors.get(0));
            error = "WhatsApp " + e.get("code") + ": " + (e.get("title") != null ? e.get("title") : e.get("message"));
        }
        applyReceipt(str(s.get("id")), state, error);
    }

    // ------------------------------------------------------------------ SMSGate (Android SMS gateway)

    @PostMapping("/sms")
    public ResponseEntity<Void> sms(@RequestBody byte[] raw,
                                    @RequestHeader(value = "X-Signature", required = false) String signature,
                                    @RequestHeader(value = "X-Timestamp", required = false) String timestamp) {
        if (!smsSigningKey.isBlank()) {
            boolean fresh = timestamp != null && timestamp.matches("\\d+")
                    && Math.abs(System.currentTimeMillis() / 1000 - Long.parseLong(timestamp)) <= 300;
            byte[] signed = concat(raw, timestamp == null ? new byte[0] : timestamp.getBytes(StandardCharsets.UTF_8));
            String expected = hmacHex(smsSigningKey, signed);
            if (!fresh || signature == null || !MessageDigest.isEqual(expected.getBytes(), signature.toLowerCase().getBytes())) {
                log.warn("SMS webhook rejected: bad or stale signature");
                return ResponseEntity.status(401).build();
            }
        }
        try {
            Map<?, ?> root = json.readValue(raw, Map.class);
            Map<?, ?> p = map(root.get("payload"));
            switch (String.valueOf(root.get("event"))) {
                case "sms:received" -> inbound.handle(Channel.SMS, str(p.get("sender")), null, str(p.get("message")),
                        QuoteSource.SMS_TEXT, null, str(root.get("id")));
                case "sms:delivered" -> applyReceipt(str(p.get("messageId")), DeliveryState.DELIVERED, null);
                case "sms:failed" -> applyReceipt(str(p.get("messageId")), DeliveryState.FAILED, "SMS failed: " + p.get("reason"));
                default -> { }
            }
        } catch (Exception e) {
            log.warn("SMS webhook could not be processed: {}", e.getMessage());
        }
        return ResponseEntity.ok().build();
    }

    // ------------------------------------------------------------------ helpers

    private void applyReceipt(String providerMessageId, DeliveryState state, String error) {
        messaging.updateStatus(providerMessageId, state, error)
                .filter(m -> m.getRfqId() != null)
                .ifPresent(m -> procurement.applyDeliveryReceipt(m.getRfqId(), state, error));
    }

    private static String hmacHex(String secret, byte[] data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(data));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static byte[] concat(byte[] a, byte[] b) {
        byte[] out = new byte[a.length + b.length];
        System.arraycopy(a, 0, out, 0, a.length);
        System.arraycopy(b, 0, out, a.length, b.length);
        return out;
    }

    private static Map<?, ?> map(Object o) { return o instanceof Map<?, ?> m ? m : Map.of(); }
    private static List<?> list(Object o) { return o instanceof List<?> l ? l : List.of(); }
    private static String str(Object o) { return o == null ? null : o.toString(); }
}
