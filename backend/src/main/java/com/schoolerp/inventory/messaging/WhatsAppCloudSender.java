package com.schoolerp.inventory.messaging;

import com.schoolerp.inventory.model.Enums.Channel;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * WhatsApp via Meta's WhatsApp Cloud API (free tier: Meta's test number plus up to 5 verified recipients;
 * user-initiated "service" conversations are free).
 *
 * Meta only lets a business START a conversation with an approved template. So the first RFQ goes out
 * as the template named in app.whatsapp.rfq-template (body params: vendor, reference, item, reply-by),
 * and once the vendor replies the 24h window is open and plain text works for the full details,
 * acknowledgements and the PO. Without a template, plain text is sent, which only works when the vendor
 * messaged the school number in the last 24h.
 */
@Component
public class WhatsAppCloudSender implements ChannelSender {

    private final String phoneNumberId;
    private final String token;
    private final String template;
    private final String templateLanguage;
    private final RestClient http;

    public WhatsAppCloudSender(@Value("${app.whatsapp.phone-number-id:}") String phoneNumberId,
                               @Value("${app.whatsapp.access-token:}") String token,
                               @Value("${app.whatsapp.api-version:v21.0}") String apiVersion,
                               @Value("${app.whatsapp.rfq-template:}") String template,
                               @Value("${app.whatsapp.template-language:en}") String templateLanguage) {
        this.phoneNumberId = phoneNumberId;
        this.token = token;
        this.template = template;
        this.templateLanguage = templateLanguage;
        this.http = RestClient.builder().baseUrl("https://graph.facebook.com/" + apiVersion).build();
    }

    @Override public Channel channel() { return Channel.WHATSAPP; }
    @Override public String provider() { return isLive() ? "WhatsApp Cloud API" : "mock"; }
    @Override public boolean isLive() { return !phoneNumberId.isBlank() && !token.isBlank(); }
    @Override public String inboundMode() { return "webhook /api/webhooks/whatsapp"; }

    @Override
    public SendResult send(Outbound m) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("messaging_product", "whatsapp");
        body.put("to", PhoneNumbers.international(m.to()));
        if (m.templateParams() != null && !template.isBlank()) {
            List<Map<String, String>> params = m.templateParams().stream()
                    .map(p -> Map.of("type", "text", "text", templateSafe(p))).toList();
            body.put("type", "template");
            body.put("template", Map.of(
                    "name", template,
                    "language", Map.of("code", templateLanguage),
                    "components", List.of(Map.of("type", "body", "parameters", params))));
        } else {
            body.put("type", "text");
            body.put("text", Map.of("preview_url", false, "body", truncate(m.body(), 4096)));
        }
        try {
            Map<?, ?> res = http.post().uri("/{id}/messages", phoneNumberId)
                    .header("Authorization", "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(Map.class);
            Object messages = res == null ? null : res.get("messages");
            if (messages instanceof List<?> l && !l.isEmpty() && l.get(0) instanceof Map<?, ?> first) {
                return SendResult.ok(String.valueOf(first.get("id")));
            }
            return SendResult.ok(null);
        } catch (RestClientResponseException e) {
            return SendResult.failed("WhatsApp " + e.getStatusCode().value() + ": " + e.getResponseBodyAsString());
        } catch (Exception e) {
            return SendResult.failed("WhatsApp: " + EmailSender.rootMessage(e));
        }
    }

    /** Template parameters may not contain newlines, tabs or more than 4 consecutive spaces. */
    private static String templateSafe(String s) {
        return truncate(s == null ? "-" : s.replaceAll("[\\r\\n\\t]+", " ").replaceAll(" {4,}", " "), 1000);
    }

    private static String truncate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }
}
