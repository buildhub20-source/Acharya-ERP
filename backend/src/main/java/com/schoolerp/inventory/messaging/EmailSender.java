package com.schoolerp.inventory.messaging;

import com.schoolerp.inventory.model.Enums.Channel;
import jakarta.mail.internet.MimeMessage;
import java.util.Properties;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

/**
 * Email over plain SMTP. Works with any mailbox that allows SMTP, e.g. Gmail (smtp.gmail.com:587 with an
 * App Password), Outlook (smtp.office365.com:587), Zoho or Brevo's free SMTP relay.
 * Vendor replies land in the same mailbox and are picked up by {@link EmailInboxPoller}.
 */
@Component
public class EmailSender implements ChannelSender {

    private final JavaMailSenderImpl mail = new JavaMailSenderImpl();
    private final String from;
    private final String fromName;
    private final boolean live;
    private final boolean imapOn;

    public EmailSender(@Value("${app.mail.smtp.host:}") String host,
                       @Value("${app.mail.smtp.port:587}") int port,
                       @Value("${app.mail.username:}") String username,
                       @Value("${app.mail.password:}") String password,
                       @Value("${app.mail.smtp.ssl:false}") boolean ssl,
                       @Value("${app.mail.from:}") String from,
                       @Value("${app.mail.from-name:Greenfield Public School - Stores}") String fromName,
                       @Value("${app.mail.imap.host:}") String imapHost) {
        this.from = from.isBlank() ? username : from;
        this.fromName = fromName;
        this.live = !host.isBlank() && !this.from.isBlank();
        this.imapOn = !imapHost.isBlank();
        mail.setHost(host);
        mail.setPort(port);
        mail.setUsername(username.isBlank() ? null : username);
        mail.setPassword(password.isBlank() ? null : password);
        mail.setDefaultEncoding("UTF-8");
        Properties p = mail.getJavaMailProperties();
        p.put("mail.smtp.auth", String.valueOf(!username.isBlank()));
        if (ssl) p.put("mail.smtp.ssl.enable", "true"); else p.put("mail.smtp.starttls.enable", "true");
        p.put("mail.smtp.connectiontimeout", "10000");
        p.put("mail.smtp.timeout", "15000");
    }

    @Override public Channel channel() { return Channel.EMAIL; }
    @Override public String provider() { return live ? "SMTP (" + mail.getHost() + ")" : "mock"; }
    @Override public boolean isLive() { return live; }
    @Override public String inboundMode() { return imapOn ? "IMAP polling of " + from : "not configured (set app.mail.imap.host)"; }

    @Override
    public SendResult send(Outbound m) {
        try {
            MimeMessage msg = mail.createMimeMessage();
            MimeMessageHelper h = new MimeMessageHelper(msg, false, "UTF-8");
            h.setFrom(from, fromName);
            h.setReplyTo(from);
            h.setTo(m.to());
            h.setSubject(m.subject());
            h.setText(m.body(), false);
            String id = "<" + UUID.randomUUID() + "@school-erp>";
            msg.saveChanges();
            msg.setHeader("Message-ID", id);
            mail.send(msg);
            return SendResult.ok(id);
        } catch (Exception e) {
            return SendResult.failed("SMTP: " + rootMessage(e));
        }
    }

    static String rootMessage(Throwable e) {
        Throwable t = e;
        while (t.getCause() != null && t.getCause() != t) t = t.getCause();
        return t.getMessage() != null ? t.getMessage() : t.getClass().getSimpleName();
    }
}
