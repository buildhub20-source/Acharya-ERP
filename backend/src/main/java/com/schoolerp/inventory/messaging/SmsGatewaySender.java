package com.schoolerp.inventory.messaging;

import com.schoolerp.inventory.model.Enums.Channel;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * SMS through SMSGate (open-source "SMS Gateway for Android", https://sms-gate.app): an Android phone with
 * the school's SIM sends and receives the SMS, so there is no per-message fee and no DLT registration,
 * and vendors reply to an ordinary Indian mobile number.
 *
 * app.sms.send-url is either the phone on the LAN (http://192.168.x.x:8080/message, "local server" mode)
 * or the free cloud relay (https://api.sms-gate.app/3rdparty/v1/messages). Replies arrive on
 * /api/webhooks/sms (event sms:received).
 */
@Component
public class SmsGatewaySender implements ChannelSender {

    private final String sendUrl;
    private final String username;
    private final String password;
    private final RestClient http = RestClient.create();

    public SmsGatewaySender(@Value("${app.sms.send-url:}") String sendUrl,
                            @Value("${app.sms.username:}") String username,
                            @Value("${app.sms.password:}") String password) {
        this.sendUrl = sendUrl;
        this.username = username;
        this.password = password;
    }

    @Override public Channel channel() { return Channel.SMS; }
    @Override public String provider() { return isLive() ? "SMSGate (Android)" : "mock"; }
    @Override public boolean isLive() { return !sendUrl.isBlank() && !username.isBlank(); }
    @Override public String inboundMode() { return "webhook /api/webhooks/sms (event sms:received)"; }

    @Override
    public SendResult send(Outbound m) {
        Map<String, Object> body = Map.of(
                "textMessage", Map.of("text", m.body()),
                "phoneNumbers", List.of(PhoneNumbers.e164(m.to())));
        try {
            Map<?, ?> res = http.post().uri(sendUrl)
                    .headers(h -> h.setBasicAuth(username, password))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(Map.class);
            Object id = res == null ? null : res.get("id");
            return SendResult.ok(id == null ? null : id.toString());
        } catch (RestClientResponseException e) {
            return SendResult.failed("SMS gateway " + e.getStatusCode().value() + ": " + e.getResponseBodyAsString());
        } catch (Exception e) {
            return SendResult.failed("SMS gateway: " + EmailSender.rootMessage(e));
        }
    }
}
