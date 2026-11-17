package com.schoolerp.inventory.model;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class PurchaseOrder {
    private String id;
    private String number;
    private String purchaseRequestId;
    private String purchaseRequestNumber;
    private String title;
    private String vendorId;
    private String vendorName;
    private String quoteId;
    private BigDecimal amount;
    private String paymentTerms;
    private LocalDate expectedDelivery;
    private Enums.PoStatus status;
    private LocalDateTime issuedAt;

    // ---- line being ordered (one line per PO in v1) ----
    /** Item master id; null for a custom item until its first receipt creates it. */
    private String itemId;
    private String categoryId;
    private String description;
    private String unit;
    private int orderedQuantity;
    /** Landed cost per unit (amount / ordered qty), used to value stock. */
    private BigDecimal unitCost;

    // ---- receipt progress (updated by GRNs) ----
    private int receivedQuantity;
    private int acceptedQuantity;
    private int rejectedQuantity;
    private LocalDateTime lastReceivedAt;

    /** Units still to come. Rejected units must be replaced, so only accepted ones count. */
    public int getPendingQuantity() {
        return Math.max(0, orderedQuantity - acceptedQuantity);
    }

    public boolean isOverdue() {
        return getPendingQuantity() > 0 && status != Enums.PoStatus.CANCELLED
                && expectedDelivery != null && expectedDelivery.isBefore(LocalDate.now());
    }
}
