package com.schoolerp.inventory.messaging;

import com.schoolerp.inventory.model.Enums.Channel;
import com.schoolerp.inventory.model.Enums.QuoteSource;
import jakarta.mail.Address;
import jakarta.mail.BodyPart;
import jakarta.mail.FetchProfile;
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
    private final String from;

    public EmailInboxPoller(InboundReplyService inbound,
                            @Value("${app.mail.imap.host:}") String host,
                            @Value("${app.mail.imap.port:993}") int port,
                            @Value("${app.mail.username:}") String username,
                            @Value("${app.mail.password:}") String password,
                            @Value("${app.mail.imap.folder:INBOX}") String folder,
                            @Value("${app.mail.from:}") String from) {
        this.inbound = inbound;
        this.host = host;
        this.port = port;
        this.username = username;
        this.password = password;
        this.folder = folder;
        this.from = from;
    }

    /** Mail the school sent itself (e.g. an RFQ to its own address) must never be read as a vendor reply. */
    private boolean isOwnAddress(String sender) {
        return sender != null && (sender.equalsIgnoreCase(username) || sender.equalsIgnoreCase(from));
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
                // Fetch only the envelope (From/Subject): this does NOT mark mail as read.
                FetchProfile envelope = new FetchProfile();
                envelope.add(FetchProfile.Item.ENVELOPE);
                inbox.fetch(unread, envelope);
                int processed = 0;
                for (Message msg : unread) {
                    String sender = senderOf(msg);
                    // Anything not from a registered vendor (the school's own mail, newsletters, personal mail)
                    // is left completely untouched: not opened, not logged, still unread.
                    if (sender == null || isOwnAddress(sender) || !inbound.isVendorEmail(sender)) continue;
                    try {
                        handle(msg, sender);
                    } catch (Exception e) {
                        log.warn("Could not process email '{}': {}", msg.getSubject(), e.getMessage());
                    }
                    msg.setFlag(Flags.Flag.SEEN, true);
                    processed++;
                }
                inbox.close(false);
                if (processed > 0) log.info("IMAP: processed {} vendor email(s)", processed);
            } finally {
                store.close();
            }
        } catch (Exception e) {
            log.warn("IMAP poll failed: {}", EmailSender.rootMessage(e));
        }
    }

    private static String senderOf(Message msg) throws Exception {
        Address[] from = msg.getFrom();
        return from != null && from.length > 0 && from[0] instanceof InternetAddress ia ? ia.getAddress() : null;
    }

    private void handle(Message msg, String sender) throws Exception {
        // Out-of-office and other auto-replies (RFC 3834) are not quotes, and answering them can loop.
        String[] auto = msg.getHeader("Auto-Submitted");
        if (auto != null && auto.length > 0 && !"no".equalsIgnoreCase(auto[0].trim())) {
            log.info("IMAP: skipping auto-reply from {}: '{}'", sender, msg.getSubject());
            return;
        }
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
