package com.schoolerp.inventory.model;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Goods Receipt Note: what physically arrived against a PO, and what passed inspection. */
@Data
@NoArgsConstructor
public class GoodsReceipt {
    private String id;
    private String number;
    private String purchaseOrderId;
    private String purchaseOrderNumber;
    private String purchaseRequestId;
    private String vendorId;
    private String vendorName;
    private String itemId;
    private String description;
    private String unit;

    private int orderedQuantity;
    private int previouslyAccepted;
    private int receivedQuantity;
    private int acceptedQuantity;
    private int rejectedQuantity;
    private String rejectionReason;
    private BigDecimal unitCost;

    private String deliveryChallan;
    private String invoiceNumber;
    private BigDecimal invoiceAmount;
    private Enums.InvoiceMatch invoiceMatch;

    private LocalDate receivedDate;
    private LocalDate expectedDate;
    private boolean onTime;
    private String receivedBy;
    private String inspectedBy;
    private String storeLocation;
    private String notes;
    private LocalDateTime createdAt;

    /** Value of accepted goods at PO cost; what the invoice should match. */
    public BigDecimal getAcceptedValue() {
        return unitCost == null ? BigDecimal.ZERO
                : unitCost.multiply(BigDecimal.valueOf(acceptedQuantity)).setScale(2, RoundingMode.HALF_UP);
    }

    public boolean isComplete() {
        return previouslyAccepted + acceptedQuantity >= orderedQuantity;
    }
}
