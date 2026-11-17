package com.schoolerp.inventory.model;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Structured quote: typed on the vendor portal or parsed from a reply. */
@Data
@NoArgsConstructor
public class Quote {
    private String id;
    private String rfqId;
    private String purchaseRequestId;
    private int round;
    private String vendorId;
    private String vendorName;
    private int version = 1;

    private BigDecimal unitPrice;
    private int quantity;
    private BigDecimal taxPercent;
    private BigDecimal deliveryCharge;
    private int deliveryDays;
    private int validityDays;
    private String paymentTerms;
    private String remarks;
    private boolean meetsSpecs = true;
    private String specDeviation;

    private Enums.QuoteSource source;
    /** Original message / OCR text / voice transcript. */
    private String rawText;
    private String attachmentName;
    /** 0..1 */
    private double parseConfidence = 1.0;
    private List<String> lowConfidenceFields = new ArrayList<>();
    private boolean manuallyVerified;
    private boolean late;
    private LocalDateTime receivedAt;

    public BigDecimal getSubtotal() {
        return unitPrice == null ? BigDecimal.ZERO : unitPrice.multiply(BigDecimal.valueOf(quantity));
    }

    public BigDecimal getTaxAmount() {
        BigDecimal pct = taxPercent == null ? BigDecimal.ZERO : taxPercent;
        return getSubtotal().multiply(pct).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
    }

    /** Landed cost = price + tax + delivery. Used to find L1. */
    public BigDecimal getLandedCost() {
        BigDecimal delivery = deliveryCharge == null ? BigDecimal.ZERO : deliveryCharge;
        return getSubtotal().add(getTaxAmount()).add(delivery).setScale(2, RoundingMode.HALF_UP);
    }

    public boolean isNeedsReview() {
        return !manuallyVerified && (parseConfidence < 0.8 || !lowConfidenceFields.isEmpty());
    }
}
