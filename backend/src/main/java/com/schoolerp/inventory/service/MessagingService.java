package com.schoolerp.inventory.service;

import com.schoolerp.inventory.model.ContactPerson;
import com.schoolerp.inventory.model.Enums.Channel;
import com.schoolerp.inventory.model.PrLine;
import com.schoolerp.inventory.model.PurchaseOrder;
import com.schoolerp.inventory.model.PurchaseRequest;
import com.schoolerp.inventory.model.Rfq;
import com.schoolerp.inventory.model.Vendor;
import com.schoolerp.inventory.web.dto.Dtos.OutboxMessage;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Mock multi-channel sender. Messages are written to an in-memory outbox instead of
 * being delivered. Swap in Email (SMTP), WhatsApp Business API and SMS gateway
 * adapters here later.
 */
@Service
public class MessagingService {

    private static final Logger log = LoggerFactory.getLogger(MessagingService.class);
    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("dd MMM yyyy, hh:mm a");
    private static final DateTimeFormatter D = DateTimeFormatter.ofPattern("dd MMM yyyy");

    private final List<OutboxMessage> outbox = Collections.synchronizedList(new ArrayList<>());

    /** Templated RFQ message built from the purchase request. */
    public String buildRfqMessage(PurchaseRequest pr, Rfq rfq, Vendor vendor) {
        StringBuilder sb = new StringBuilder();
        sb.append("Dear ").append(vendor.getDisplayName()).append(",\n\n");
        sb.append("Greenfield Public School invites your quotation for the following.\n");
        sb.append("Reference: ").append(rfq.getReference()).append("\n\n");
        int i = 1;
        for (PrLine line : pr.getLines()) {
            sb.append(i++).append(". ").append(line.getDescription())
              .append(" - Qty ").append(line.getQuantity()).append(' ').append(line.getUnit());
            if (line.getSpecs() != null && !line.getSpecs().isBlank()) {
                sb.append(" (").append(line.getSpecs()).append(')');
            }
            sb.append('\n');
        }
        sb.append("\nRequired delivery by: ").append(pr.getDueDate().format(D));
        if (pr.getDeliveryLocation() != null) {
            sb.append("\nDeliver to: ").append(pr.getDeliveryLocation());
        }
        sb.append("\nPlease reply by: ").append(pr.getQuoteDeadline().format(DT));
        sb.append("\n\nKindly include: unit price, GST %, delivery charges, delivery days, quote validity and payment terms.");
        sb.append("\nYou can reply to this message, or submit on the vendor portal.");
        sb.append("\n\nRegards,\nStores & Purchase, Greenfield Public School");
        return sb.toString();
    }

    public void sendRfq(Rfq rfq, Vendor vendor) {
        for (Channel channel : rfq.getChannels()) {
            send(channel, vendor, "RFQ " + rfq.getReference(), rfq.getMessage());
        }
    }

    public void sendReminder(Rfq rfq, Vendor vendor) {
        String body = "Reminder (" + rfq.getReminderCount() + "): we have not yet received your quotation for "
                + rfq.getReference() + ". Please reply at the earliest.";
        for (Channel channel : rfq.getChannels()) {
            send(channel, vendor, "Reminder: RFQ " + rfq.getReference(), body);
        }
    }

    public void sendPurchaseOrder(PurchaseOrder po, Vendor vendor) {
        String body = "Dear " + vendor.getDisplayName() + ",\n\nPlease find Purchase Order " + po.getNumber()
                + " for \"" + po.getTitle() + "\" amounting to Rs " + po.getAmount()
                + ". Expected delivery by " + po.getExpectedDelivery().format(D)
                + ".\nKindly acknowledge on the vendor portal.\n\nStores & Purchase, Greenfield Public School";
        send(Channel.EMAIL, vendor, "Purchase Order " + po.getNumber(), body);
        send(Channel.WHATSAPP, vendor, "Purchase Order " + po.getNumber(), body);
    }

    public void sendNotSelected(PurchaseRequest pr, Vendor vendor) {
        send(Channel.EMAIL, vendor, "Quotation status: " + pr.getNumber(),
                "Thank you for your quotation for \"" + pr.getTitle()
                        + "\". We have proceeded with another vendor this time.");
    }

    public void sendPortalInvite(Vendor vendor, String link) {
        send(Channel.EMAIL, vendor, "Invitation to the Greenfield vendor portal",
                "Greenfield Public School has invited you to register as a supplier.\n"
                        + "Complete your profile, verify your contact and upload your GST / PAN documents here:\n" + link
                        + "\n\nThis link is personal to your business; please do not share it.");
        send(Channel.WHATSAPP, vendor, "Vendor portal invite",
                "Greenfield Public School has invited you to its vendor portal. Complete your registration: " + link);
    }

    /** One-time code to a specific contact's phone or email (not necessarily the primary contact). */
    public void sendOtp(Vendor vendor, ContactPerson contact, boolean phone, String code) {
        String body = code + " is your Greenfield vendor portal verification code. It expires in 10 minutes. Do not share it.";
        Channel channel = phone ? Channel.SMS : Channel.EMAIL;
        String to = phone ? contact.getPhone() : contact.getEmail();
        record(channel, vendor, to, "Verification code", body);
    }

    public void notifyVendor(Vendor vendor, String subject, String body) {
        send(Channel.EMAIL, vendor, subject, body);
    }

    private void send(Channel channel, Vendor vendor, String subject, String body) {
        ContactPerson c = vendor.getContacts().isEmpty() ? null : vendor.getContacts().get(0);
        String to = switch (channel) {
            case EMAIL -> c == null ? "-" : c.getEmail();
            case WHATSAPP -> c == null ? "-" : c.getWhatsapp();
            case SMS -> c == null ? "-" : c.getPhone();
            case PORTAL -> "portal:" + vendor.getCode();
        };
        record(channel, vendor, to, subject, body);
    }

    private void record(Channel channel, Vendor vendor, String to, String subject, String body) {
        outbox.add(0, new OutboxMessage(LocalDateTime.now(), channel, vendor.getId(),
                vendor.getDisplayName(), to, subject, body));
        log.info("[MOCK {}] to {} <{}>: {}", channel, vendor.getDisplayName(), to, subject);
    }

    public List<OutboxMessage> outbox(String vendorId, int limit) {
        synchronized (outbox) {
            return outbox.stream()
                    .filter(m -> vendorId == null || m.vendorId().equals(vendorId))
                    .limit(limit)
                    .toList();
        }
    }
}
