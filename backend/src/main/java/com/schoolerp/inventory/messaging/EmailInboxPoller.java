package com.schoolerp.inventory.messaging;

import com.schoolerp.inventory.model.Enums.Channel;
import com.schoolerp.inventory.model.Enums.QuoteSource;
import jakarta.mail.Address;
import jakarta.mail.BodyPart;
import jakarta.mail.Flags;
import jakarta.mail.Folder;
import jakarta.mail.Message;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.Store;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.search.FlagTerm;
import java.util.Locale;
import java.util.Properties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Reads vendor email replies: polls the school mailbox over IMAP for unread mail, hands each one to
 * {@link InboundReplyService}, then marks it read. Gmail: imap.gmail.com:993 with the same App Password as SMTP.
 */
@Component
public class EmailInboxPoller {

    private static final Logger log = LoggerFactory.getLogger(EmailInboxPoller.class);

    private final InboundReplyService inbound;
    private final String host;
    private final int port;
    private final String username;
    private final String password;
    private final String folder;

    public EmailInboxPoller(InboundReplyService inbound,
                            @Value("${app.mail.imap.host:}") String host,
                            @Value("${app.mail.imap.port:993}") int port,
                            @Value("${app.mail.username:}") String username,
                            @Value("${app.mail.password:}") String password,
                            @Value("${app.mail.imap.folder:INBOX}") String folder) {
        this.inbound = inbound;
        this.host = host;
        this.port = port;
        this.username = username;
        this.password = password;
        this.folder = folder;
    }

    @Scheduled(fixedDelayString = "${app.mail.imap.poll-ms:60000}", initialDelay = 15000)
    public void poll() {
        if (host.isBlank() || username.isBlank()) return;
        Properties props = new Properties();
        props.put("mail.store.protocol", "imaps");
        props.put("mail.imaps.connectiontimeout", "10000");
        props.put("mail.imaps.timeout", "20000");
        try {
            Store store = Session.getInstance(props).getStore("imaps");
            store.connect(host, port, username, password);
            try {
                Folder inbox = store.getFolder(folder);
                inbox.open(Folder.READ_WRITE);
                Message[] unread = inbox.search(new FlagTerm(new Flags(Flags.Flag.SEEN), false));
                for (Message msg : unread) {
                    try {
                        handle(msg);
                    } catch (Exception e) {
                        log.warn("Could not process email '{}': {}", msg.getSubject(), e.getMessage());
                    }
                    msg.setFlag(Flags.Flag.SEEN, true);
                }
                inbox.close(false);
                if (unread.length > 0) log.info("IMAP: processed {} new email(s)", unread.length);
            } finally {
                store.close();
            }
        } catch (Exception e) {
            log.warn("IMAP poll failed: {}", EmailSender.rootMessage(e));
        }
    }

    private void handle(Message msg) throws Exception {
        Address[] from = msg.getFrom();
        String sender = from != null && from.length > 0 && from[0] instanceof InternetAddress ia ? ia.getAddress() : null;
        Parsed p = new Parsed();
        walk(msg, p);
        String text = stripQuoted(p.plain != null ? p.plain : p.html != null ? htmlToText(p.html) : "");
        QuoteSource source = QuoteSource.EMAIL_TEXT;
        if (p.attachment != null) {
            String a = p.attachment.toLowerCase(Locale.ROOT);
            if (a.endsWith(".pdf")) source = QuoteSource.PDF;
            else if (a.matches(".*\\.(jpe?g|png|webp|heic)$")) source = QuoteSource.IMAGE;
            else if (a.matches(".*\\.(ogg|opus|mp3|m4a|wav|aac)$")) source = QuoteSource.VOICE;
        }
        String[] ids = msg.getHeader("Message-ID");
        inbound.handle(Channel.EMAIL, sender, msg.getSubject(), text, source, p.attachment,
                ids != null && ids.length > 0 ? ids[0] : null);
    }

    private static final class Parsed { String plain; String html; String attachment; }

    private static void walk(Part part, Parsed p) throws Exception {
        String disposition = part.getDisposition();
        if (part.getFileName() != null && (Part.ATTACHMENT.equalsIgnoreCase(disposition) || !part.isMimeType("text/*"))) {
            if (p.attachment == null) p.attachment = part.getFileName();
            return;
        }
        if (part.isMimeType("text/plain") && p.plain == null) {
            p.plain = String.valueOf(part.getContent());
        } else if (part.isMimeType("text/html") && p.html == null) {
            p.html = String.valueOf(part.getContent());
        } else if (part.isMimeType("multipart/*")) {
            Multipart mp = (Multipart) part.getContent();
            for (int i = 0; i < mp.getCount(); i++) {
                BodyPart bp = mp.getBodyPart(i);
                walk(bp, p);
            }
        }
    }

    /** Keep only the vendor's new text: drop "On ... wrote:" and everything quoted below it. */
    static String stripQuoted(String text) {
        StringBuilder out = new StringBuilder();
        for (String line : text.split("\\r?\\n")) {
            String t = line.trim();
            if (t.startsWith(">") || t.matches("(?i)^on .+wrote:$") || t.matches("(?i)^-+ ?original message ?-+$")
                    || t.matches("(?i)^from:.*@.*")) break;
            out.append(line).append('\n');
        }
        return out.toString().trim();
    }

    private static String htmlToText(String html) {
        return html.replaceAll("(?i)<br\\s*/?>|</p>|</div>", "\n").replaceAll("<[^>]+>", " ")
                .replace("&nbsp;", " ").replace("&amp;", "&").replaceAll("[ \\t]+", " ");
    }
}
