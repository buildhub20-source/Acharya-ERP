package com.schoolerp.inventory.service;

import com.schoolerp.inventory.messaging.ChannelSender;
import com.schoolerp.inventory.messaging.ChannelSender.Outbound;
import com.schoolerp.inventory.messaging.ChannelSender.SendResult;
import com.schoolerp.inventory.messaging.PhoneNumbers;
import com.schoolerp.inventory.model.ContactPerson;
import com.schoolerp.inventory.model.Enums.Channel;
import com.schoolerp.inventory.model.Enums.DeliveryState;
import com.schoolerp.inventory.model.Enums.MessageDirection;
import com.schoolerp.inventory.model.MessageLog;
import com.schoolerp.inventory.model.PrLine;
import com.schoolerp.inventory.model.PurchaseOrder;
import com.schoolerp.inventory.model.PurchaseRequest;
import com.schoolerp.inventory.model.Quote;
import com.schoolerp.inventory.model.Rfq;
import com.schoolerp.inventory.model.Vendor;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Sends every vendor message on the vendor's own preferred channel (email / WhatsApp / SMS / portal)
 * through the configured provider, and keeps a two-way message log (outbound + inbound replies).
 *
 * A channel without credentials falls back to "mock" (logged, not sent). While testing, live sends only
 * go to recipients in app.messaging.allowed-recipients, so seeded demo vendors are never contacted.
 */
@Service
public class MessagingService {

    private static final Logger log = LoggerFactory.getLogger(MessagingService.class);
    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("dd MMM yyyy, hh:mm a");
    private static final DateTimeFormatter D = DateTimeFormatter.ofPattern("dd MMM yyyy");

    private final Map<Channel, ChannelSender> senders = new EnumMap<>(Channel.class);
    private final List<MessageLog> messages = Collections.synchronizedList(new ArrayList<>());
    private final AtomicLong seq = new AtomicLong();
    private final boolean allowAll;
    private final List<String> allowed;
    private final String schoolName;

    public MessagingService(List<ChannelSender> senderBeans,
                            @Value("${app.messaging.allow-all-recipients:false}") boolean allowAll,
                            @Value("${app.messaging.allowed-recipients:}") String allowed,
                            @Value("${app.school-name:Greenfield Public School}") String schoolName) {
        senderBeans.forEach(s -> senders.put(s.channel(), s));
        this.allowAll = allowAll;
        this.allowed = Arrays.stream(allowed.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
        this.schoolName = schoolName;
        senders.values().forEach(s -> log.info("Channel {}: {} ({})", s.channel(), s.provider(), s.isLive() ? "live" : "mock"));
    }

    // ------------------------------------------------------------------ channel choice

    /**
     * The one channel an RFQ goes out on: the primary contact's preferred channel, as long as we have an
     * address for it. Otherwise the first channel we can reach them on.
     */
    public Channel channelFor(Vendor v) {
        ContactPerson c = primary(v);
        if (c != null && c.getPreferredChannel() != null && reachable(v, c.getPreferredChannel())) {
            return c.getPreferredChannel();
        }
        for (Channel ch : List.of(Channel.WHATSAPP, Channel.EMAIL, Channel.SMS, Channel.PORTAL)) {
            if (reachable(v, ch)) return ch;
        }
        return null;
    }

    public boolean reachable(Vendor v, Channel ch) {
        String a = address(v, ch);
        return a != null && !a.isBlank();
    }

    public String address(Vendor v, Channel ch) {
        ContactPerson c = primary(v);
        return switch (ch) {
            case EMAIL -> c == null ? null : c.getEmail();
            case WHATSAPP -> c == null ? null : (notBlank(c.getWhatsapp()) ? c.getWhatsapp() : null);
            case SMS -> c == null ? null : (notBlank(c.getPhone()) ? c.getPhone() : c.getWhatsapp());
            case PORTAL -> v.isPortalEnabled() ? "portal:" + v.getCode() : null;
        };
    }

    private static ContactPerson primary(Vendor v) {
        return v.getContacts().isEmpty() ? null : v.getContacts().get(0);
    }

    // ------------------------------------------------------------------ templates

    /** Full RFQ text (email, WhatsApp, portal). */
    public String buildRfqMessage(PurchaseRequest pr, Rfq rfq, Vendor vendor) {
        StringBuilder sb = new StringBuilder();
        sb.append("Dear ").append(vendor.getDisplayName()).append(",\n\n");
        sb.append(schoolName).append(" invites your quotation for the following.\n");
        sb.append("Reference: ").append(rfq.getReference()).append("\n\n");
        int i = 1;
        for (PrLine line : pr.getLines()) {
            sb.append(i++).append(". ").append(line.getDescription())
              .append(" - Qty ").append(line.getQuantity()).append(' ').append(line.getUnit());
            if (notBlank(line.getSpecs())) sb.append(" (").append(line.getSpecs()).append(')');
            sb.append('\n');
        }
        sb.append("\nRequired delivery by: ").append(pr.getDueDate().format(D));
        if (pr.getDeliveryLocation() != null) sb.append("\nDeliver to: ").append(pr.getDeliveryLocation());
        sb.append("\nPlease reply by: ").append(pr.getQuoteDeadline().format(DT));
        sb.append("\n\nKindly include: unit price, GST %, delivery charges, delivery days, quote validity and payment terms.");
        sb.append("\nJust reply to this message with your quote (keep ").append(rfq.getReference())
          .append(" in the reply). A PDF or photo of your quotation is fine too.");
        sb.append("\n\nRegards,\nStores & Purchase, ").append(schoolName);
        return sb.toString();
    }

    /** Short version for SMS (each 160 characters is a separate SMS part). */
    public String buildRfqSms(PurchaseRequest pr, Rfq rfq) {
        PrLine l = pr.getLines().get(0);
        return schoolName + " " + rfq.getReference() + ": quote for " + l.getQuantity() + " " + l.getUnit() + " "
                + l.getDescription() + (notBlank(l.getSpecs()) ? " (" + l.getSpecs() + ")" : "")
                + ". Need by " + pr.getDueDate().format(D) + ". Reply to this SMS by " + pr.getQuoteDeadline().format(DT)
                + " with: rate per unit, GST %, delivery charge, delivery days.";
    }

    private List<String> rfqTemplateParams(PurchaseRequest pr, Rfq rfq, Vendor vendor) {
        PrLine l = pr.getLines().get(0);
        return List.of(vendor.getDisplayName(), rfq.getReference(),
                l.getQuantity() + " " + l.getUnit() + " " + l.getDescription(), pr.getQuoteDeadline().format(DT));
    }

    // ------------------------------------------------------------------ business messages

    public MessageLog sendRfq(PurchaseRequest pr, Rfq rfq, Vendor vendor) {
        Channel ch = rfq.getChannels().get(0);
        String body = ch == Channel.SMS ? buildRfqSms(pr, rfq) : rfq.getMessage();
        return deliver(ch, vendor, rfq.getId(), "Request for Quotation " + rfq.getReference() + " - " + pr.getTitle(),
                body, ch == Channel.WHATSAPP ? rfqTemplateParams(pr, rfq, vendor) : null);
    }

    public MessageLog sendReminder(Rfq rfq, Vendor vendor) {
        String body = "Reminder (" + rfq.getReminderCount() + "): we have not yet received your quotation for "
                + rfq.getReference() + ". Please reply to this message with your rate at the earliest. - " + schoolName;
        return deliver(rfq.getChannels().get(0), vendor, rfq.getId(), "Reminder: RFQ " + rfq.getReference(), body, null);
    }

    /** Sent on the vendor's channel as soon as their reply has been read into a quote. */
    public void sendReplyAcknowledgement(Rfq rfq, Vendor vendor, Channel ch, Quote q) {
        String body = "Thank you. We have received your quotation for " + rfq.getReference()
                + " (Rs " + q.getUnitPrice() + " per unit, landed Rs " + q.getLandedCost() + ")."
                + " We will inform you of the outcome. - " + schoolName;
        deliver(ch, vendor, rfq.getId(), "Re: RFQ " + rfq.getReference() + " - quotation received", body, null);
    }

    /** Tells the vendor their reply had no price we could read, so they can resend. */
    public void sendReplyNotUnderstood(Rfq rfq, Vendor vendor, Channel ch) {
        String body = "Thank you for your reply to " + rfq.getReference() + ". We could not find a price in it."
                + " Please reply with your rate per unit, GST %, delivery charge and delivery days. - " + schoolName;
        deliver(ch, vendor, rfq.getId(), "Re: RFQ " + rfq.getReference(), body, null);
    }

    /** Award: the full requirement and agreed commercials go to the winning vendor on their channel. */
    public MessageLog sendPurchaseOrder(PurchaseOrder po, Vendor vendor, PurchaseRequest pr, Quote q, Channel ch) {
        StringBuilder sb = new StringBuilder();
        sb.append("Dear ").append(vendor.getDisplayName()).append(",\n\n");
        sb.append("We are pleased to confirm your quotation for ").append(pr.getTitle())
          .append(". Purchase Order ").append(po.getNumber()).append(" (ref ").append(pr.getNumber()).append(")\n\n");
        for (PrLine l : pr.getLines()) {
            sb.append("Item: ").append(l.getDescription()).append('\n');
            if (notBlank(l.getSpecs())) sb.append("Specs: ").append(l.getSpecs()).append('\n');
            sb.append("Quantity: ").append(l.getQuantity()).append(' ').append(l.getUnit()).append('\n');
        }
        sb.append("Rate: Rs ").append(q.getUnitPrice()).append(" per unit + GST ").append(q.getTaxPercent()).append("%\n");
        sb.append("Delivery charge: Rs ").append(q.getDeliveryCharge()).append('\n');
        sb.append("Order value: Rs ").append(po.getAmount()).append('\n');
        sb.append("Deliver by: ").append(po.getExpectedDelivery().format(D)).append('\n');
        if (pr.getDeliveryLocation() != null) sb.append("Deliver to: ").append(pr.getDeliveryLocation()).append('\n');
        if (po.getPaymentTerms() != null) sb.append("Payment terms: ").append(po.getPaymentTerms()).append('\n');
        sb.append("\nPlease reply to confirm, and quote ").append(po.getNumber())
          .append(" on your invoice and delivery challan.\n\nStores & Purchase, ").append(schoolName);
        String body = sb.toString();
        if (ch == Channel.SMS) {
            body = schoolName + ": PO " + po.getNumber() + " confirmed. " + pr.getLines().get(0).getQuantity() + " "
                    + pr.getLines().get(0).getUnit() + " " + pr.getLines().get(0).getDescription() + " @ Rs " + q.getUnitPrice()
                    + "+GST " + q.getTaxPercent() + "%, total Rs " + po.getAmount() + ", deliver by "
                    + po.getExpectedDelivery().format(D) + ". Please reply YES to confirm.";
        }
        return deliver(ch, vendor, null, "Purchase Order " + po.getNumber() + " - " + pr.getTitle(), body, null);
    }

    public void sendNotSelected(PurchaseRequest pr, Vendor vendor, Channel ch) {
        deliver(ch, vendor, null, "Quotation status: " + pr.getNumber(),
                "Thank you for your quotation for \"" + pr.getTitle()
                        + "\". We have proceeded with another vendor this time. - " + schoolName, null);
    }

    public void sendPortalInvite(Vendor vendor) {
        String link = "http://localhost:3000/portal/register?code=" + vendor.getCode();
        Channel ch = Optional.ofNullable(channelFor(vendor)).orElse(Channel.EMAIL);
        deliver(ch, vendor, null, "Invitation to " + schoolName + " vendor portal",
                schoolName + " has invited you to register as a vendor. Complete your profile here: " + link, null);
    }

    public void notifyVendor(Vendor vendor, String subject, String body) {
        Channel ch = Optional.ofNullable(channelFor(vendor)).orElse(Channel.EMAIL);
        deliver(ch, vendor, null, subject, body, null);
    }

    // ------------------------------------------------------------------ transport

    private MessageLog deliver(Channel ch, Vendor vendor, String rfqId, String subject, String body, List<String> templateParams) {
        MessageLog m = newLog(MessageDirection.OUTBOUND, ch);
        m.setVendorId(vendor.getId());
        m.setVendorName(vendor.getDisplayName());
        m.setTo(address(vendor, ch));
        m.setSubject(subject);
        m.setBody(body);
        m.setRfqId(rfqId);

        ChannelSender sender = senders.get(ch);
        if (ch == Channel.PORTAL) {
            m.setProvider("portal");
            m.setStatus(DeliveryState.SENT);
        } else if (m.getTo() == null || m.getTo().isBlank()) {
            m.setProvider(sender == null ? "-" : sender.provider());
            m.setStatus(DeliveryState.FAILED);
            m.setError("Vendor has no " + ch.name().toLowerCase() + " address");
        } else if (sender == null || !sender.isLive()) {
            m.setProvider("mock");
            m.setStatus(DeliveryState.MOCK);
        } else if (!isAllowed(m.getTo())) {
            m.setProvider(sender.provider());
            m.setStatus(DeliveryState.BLOCKED);
            m.setError("Not sent: recipient is not in app.messaging.allowed-recipients (test safety)");
        } else {
            m.setProvider(sender.provider());
            SendResult r = sender.send(new Outbound(m.getTo(), subject, body, templateParams));
            m.setStatus(r.ok() ? DeliveryState.SENT : DeliveryState.FAILED);
            m.setProviderMessageId(r.providerMessageId());
            m.setError(r.error());
        }
        messages.add(0, m);
        log.info("[{} {}] to {} <{}>: {} {}", ch, m.getStatus(), vendor.getDisplayName(), m.getTo(), subject,
                m.getError() == null ? "" : "- " + m.getError());
        return m;
    }

    /** Admin "send test message" from the channel settings page. Bypasses the allowlist: you typed the recipient. */
    public MessageLog sendTest(Channel ch, String to, String body) {
        ChannelSender sender = senders.get(ch);
        MessageLog m = newLog(MessageDirection.OUTBOUND, ch);
        m.setVendorName("(test)");
        m.setTo(to);
        m.setSubject("Test message from " + schoolName);
        m.setBody(body);
        if (sender == null || !sender.isLive()) {
            m.setProvider("mock");
            m.setStatus(DeliveryState.MOCK);
            m.setError(ch + " is not configured; see README > Messaging channels");
        } else {
            m.setProvider(sender.provider());
            SendResult r = sender.send(Outbound.text(to, m.getSubject(), body));
            m.setStatus(r.ok() ? DeliveryState.SENT : DeliveryState.FAILED);
            m.setProviderMessageId(r.providerMessageId());
            m.setError(r.error());
        }
        messages.add(0, m);
        return m;
    }

    public MessageLog logInbound(Channel ch, String from, String subject, String body, String attachmentName,
                                 String providerMessageId) {
        MessageLog m = newLog(MessageDirection.INBOUND, ch);
        ChannelSender sender = senders.get(ch);
        m.setProvider(sender == null ? "-" : sender.provider());
        m.setTo(from);
        m.setSubject(subject);
        m.setBody(body);
        m.setAttachmentName(attachmentName);
        m.setProviderMessageId(providerMessageId);
        m.setStatus(DeliveryState.UNMATCHED);
        messages.add(0, m);
        return m;
    }

    public boolean alreadyReceived(String providerMessageId) {
        if (providerMessageId == null) return false;
        synchronized (messages) {
            return messages.stream().anyMatch(m -> m.getDirection() == MessageDirection.INBOUND
                    && providerMessageId.equals(m.getProviderMessageId()));
        }
    }

    /** Delivery receipt from a provider webhook. Never moves a message backwards (read stays read). */
    public Optional<MessageLog> updateStatus(String providerMessageId, DeliveryState state, String error) {
        if (providerMessageId == null) return Optional.empty();
        synchronized (messages) {
            Optional<MessageLog> m = messages.stream()
                    .filter(x -> x.getDirection() == MessageDirection.OUTBOUND && providerMessageId.equals(x.getProviderMessageId()))
                    .findFirst();
            m.ifPresent(x -> {
                if (rank(state) > rank(x.getStatus())) x.setStatus(state);
                if (error != null) x.setError(error);
            });
            return m;
        }
    }

    private static int rank(DeliveryState s) {
        return switch (s) {
            case SENT -> 1;
            case DELIVERED -> 2;
            case READ -> 3;
            case FAILED -> 4;
            default -> 0;
        };
    }

    private boolean isAllowed(String to) {
        if (allowAll) return true;
        return allowed.stream().anyMatch(a -> a.equalsIgnoreCase(to) || PhoneNumbers.same(a, to));
    }

    private MessageLog newLog(MessageDirection dir, Channel ch) {
        MessageLog m = new MessageLog();
        m.setId("MSG-" + seq.incrementAndGet());
        m.setAt(LocalDateTime.now());
        m.setDirection(dir);
        m.setChannel(ch);
        return m;
    }

    // ------------------------------------------------------------------ queries

    public List<MessageLog> outbox(String vendorId, int limit) {
        synchronized (messages) {
            return messages.stream()
                    .filter(m -> vendorId == null || vendorId.equals(m.getVendorId()))
                    .limit(limit)
                    .toList();
        }
    }

    public List<Map<String, Object>> channelStatus() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Channel ch : List.of(Channel.EMAIL, Channel.WHATSAPP, Channel.SMS)) {
            ChannelSender s = senders.get(ch);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("channel", ch);
            m.put("live", s != null && s.isLive());
            m.put("provider", s == null ? "-" : s.provider());
            m.put("inbound", s == null ? "-" : s.inboundMode());
            out.add(m);
        }
        Map<String, Object> safety = new LinkedHashMap<>();
        safety.put("channel", "ALLOWLIST");
        safety.put("allowAll", allowAll);
        safety.put("allowed", allowed);
        out.add(safety);
        return out;
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
