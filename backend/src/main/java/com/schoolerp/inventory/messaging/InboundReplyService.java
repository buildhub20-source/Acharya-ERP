package com.schoolerp.inventory.messaging;

import com.schoolerp.inventory.model.ContactPerson;
import com.schoolerp.inventory.model.Enums.Channel;
import com.schoolerp.inventory.model.Enums.DeliveryState;
import com.schoolerp.inventory.model.Enums.QuoteSource;
import com.schoolerp.inventory.model.MessageLog;
import com.schoolerp.inventory.model.Quote;
import com.schoolerp.inventory.model.Rfq;
import com.schoolerp.inventory.model.Vendor;
import com.schoolerp.inventory.repository.Repositories.VendorRepository;
import com.schoolerp.inventory.service.MessagingService;
import com.schoolerp.inventory.service.ProcurementService;
import com.schoolerp.inventory.service.QuoteParserService;
import com.schoolerp.inventory.web.dto.Dtos.RawReplyRequest;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Turns a vendor's reply (from IMAP, the WhatsApp webhook or the SMS webhook) into a quote on the right RFQ.
 *
 * Rule: a reply only counts for an RFQ that was sent to that vendor on the SAME channel it came back on.
 */
@Service
public class InboundReplyService {

    private static final Logger log = LoggerFactory.getLogger(InboundReplyService.class);
    private static final Pattern RFQ_REF = Pattern.compile("RFQ-\\d{4}-\\d{4}", Pattern.CASE_INSENSITIVE);

    private final VendorRepository vendors;
    private final ProcurementService procurement;
    private final MessagingService messaging;
    private final QuoteParserService parser;

    public InboundReplyService(VendorRepository vendors, ProcurementService procurement,
                               MessagingService messaging, QuoteParserService parser) {
        this.vendors = vendors;
        this.procurement = procurement;
        this.messaging = messaging;
        this.parser = parser;
    }

    /**
     * @param from           email address or phone number of the sender
     * @param source         EMAIL_TEXT / WHATSAPP_TEXT / SMS_TEXT, or PDF / IMAGE / VOICE when the reply is an attachment
     * @param attachmentName file name of a PDF / photo / voice note, if any
     */
    public synchronized MessageLog handle(Channel channel, String from, String subject, String text,
                                          QuoteSource source, String attachmentName, String providerMessageId) {
        if (messaging.alreadyReceived(providerMessageId)) return null;   // provider retried the webhook
        String body = text == null ? "" : text.trim();
        MessageLog in = messaging.logInbound(channel, from, subject, body, attachmentName, providerMessageId);

        Optional<Vendor> vendor = findVendor(channel, from);
        if (vendor.isEmpty()) {
            in.setError("Sender is not a registered vendor contact");
            return in;
        }
        Vendor v = vendor.get();
        in.setVendorId(v.getId());
        in.setVendorName(v.getDisplayName());

        List<Rfq> open = procurement.openRfqsFor(v.getId(), channel);
        if (open.isEmpty()) {
            in.setError("No open RFQ was sent to this vendor on " + channel + "; reply not used as a quote");
            return in;
        }
        Rfq rfq = byReference(open, (subject == null ? "" : subject) + " " + body).orElseGet(() -> pickRfq(open, body));
        in.setRfqId(rfq.getId());

        Quote probe = parser.parse(body, source, 1);
        boolean hasPrice = !probe.getLowConfidenceFields().contains("unitPrice");
        if (!hasPrice) {
            procurement.markRepliedWithoutQuote(rfq);
            in.setStatus(DeliveryState.RECEIVED);
            if (attachmentName != null) {
                in.setError("Attachment received; open it and use \"Log reply\" to enter the quote");
            } else {
                in.setError("No price found in the reply; vendor asked to resend");
                messaging.sendReplyNotUnderstood(rfq, v, channel);
            }
            return in;
        }
        try {
            Quote q = procurement.recordRawReply(rfq.getPurchaseRequestId(),
                    new RawReplyRequest(rfq.getId(), source, body, attachmentName));
            in.setStatus(DeliveryState.RECEIVED);
            messaging.sendReplyAcknowledgement(rfq, v, channel, q);
        } catch (RuntimeException e) {
            in.setError("Could not record quote: " + e.getMessage());
            log.warn("Inbound {} reply from {} not recorded: {}", channel, from, e.getMessage());
        }
        return in;
    }

    private Optional<Vendor> findVendor(Channel channel, String from) {
        if (from == null || from.isBlank()) return Optional.empty();
        return vendors.findAll().stream().filter(v -> v.getContacts().stream().anyMatch(c -> matches(c, channel, from)))
                .findFirst();
    }

    private static boolean matches(ContactPerson c, Channel channel, String from) {
        return switch (channel) {
            case EMAIL -> c.getEmail() != null && c.getEmail().equalsIgnoreCase(from.trim());
            case WHATSAPP, SMS -> PhoneNumbers.same(c.getWhatsapp(), from) || PhoneNumbers.same(c.getPhone(), from);
            case PORTAL -> false;
        };
    }

    /** Vendor kept the RFQ reference in the reply (email subjects do this automatically). */
    private static Optional<Rfq> byReference(List<Rfq> open, String text) {
        Matcher m = RFQ_REF.matcher(text);
        while (m.find()) {
            String ref = m.group().toUpperCase();
            Optional<Rfq> hit = open.stream().filter(r -> ref.equals(r.getReference())).findFirst();
            if (hit.isPresent()) return hit;
        }
        return Optional.empty();
    }

    /**
     * The reply has no RFQ reference and this vendor has more than one open RFQ on this channel
     * (e.g. the school asked the same shoe shop for shoes AND socks this week). Which one is it for?
     *
     * @param open the vendor's open RFQs on this channel, newest first (never empty)
     * @param text the reply text
     */
    Rfq pickRfq(List<Rfq> open, String text) {
        // TODO(you): decide the policy for ambiguous replies. Placeholder: assume the newest RFQ.
        return open.get(0);
    }
}
