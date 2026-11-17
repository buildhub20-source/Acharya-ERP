package com.schoolerp.inventory.model;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.Data;
import lombok.NoArgsConstructor;

/** RFQ dispatched to one vendor for a purchase request round. */
@Data
@NoArgsConstructor
public class Rfq {
    private String id;
    private String reference;
    private String purchaseRequestId;
    private int round;
    private String vendorId;
    private String vendorName;
    private List<Enums.Channel> channels = new ArrayList<>();
    private Enums.RfqStatus status;
    private LocalDateTime sentAt;
    private LocalDateTime deliveredAt;
    private LocalDateTime readAt;
    private LocalDateTime repliedAt;
    private int reminderCount;
    private LocalDateTime lastReminderAt;
    private String message;
}
