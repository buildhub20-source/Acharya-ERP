package com.schoolerp.inventory.model;

import com.schoolerp.inventory.model.Enums.Channel;
import com.schoolerp.inventory.model.Enums.DeliveryState;
import com.schoolerp.inventory.model.Enums.MessageDirection;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.NoArgsConstructor;

/** One message in or out on any channel. Mutable because delivery/read receipts arrive later. */
@Data
@NoArgsConstructor
public class MessageLog {
    private String id;
    private LocalDateTime at;
    private MessageDirection direction;
    private Channel channel;
    /** Provider that carried it, e.g. "SMTP", "WhatsApp Cloud API", "SMSGate", "mock". */
    private String provider;
    private String vendorId;
    private String vendorName;
    /** Recipient (outbound) or sender (inbound) address / number. */
    private String to;
    private String subject;
    private String body;
    private String rfqId;
    private String providerMessageId;
    private DeliveryState status;
    private String error;
    private String attachmentName;
}
