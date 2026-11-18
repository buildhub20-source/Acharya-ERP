package com.schoolerp.inventory.messaging;

import com.schoolerp.inventory.model.Enums.Channel;
import java.util.List;

/** One outbound channel (email, WhatsApp, SMS). Each implementation wraps one provider. */
public interface ChannelSender {

    Channel channel();

    /** Human-readable provider name shown in the portal. */
    String provider();

    /** True when credentials are configured; otherwise messages are only logged (mock). */
    boolean isLive();

    /** How replies come back on this channel, e.g. "IMAP polling" or "webhook /api/webhooks/sms". */
    String inboundMode();

    SendResult send(Outbound message);

    /**
     * @param templateParams values for a provider-side template (WhatsApp needs an approved template to
     *                       start a conversation); null when the message is plain text.
     */
    record Outbound(String to, String subject, String body, List<String> templateParams) {
        public static Outbound text(String to, String subject, String body) {
            return new Outbound(to, subject, body, null);
        }
    }

    record SendResult(boolean ok, String providerMessageId, String error) {
        public static SendResult ok(String id) { return new SendResult(true, id, null); }
        public static SendResult failed(String error) { return new SendResult(false, null, error); }
    }
}
