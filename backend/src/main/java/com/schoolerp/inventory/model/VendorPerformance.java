package com.schoolerp.inventory.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Rolled-up scorecard; updated on RFQ / PO events. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class VendorPerformance {
    private int rfqsReceived;
    private int rfqsResponded;
    private double avgResponseHours;
    private int quotesWon;
    private double onTimeDeliveryPct;
    private double qualityAcceptancePct;
    /** 1..5, given by the manager after delivery. */
    private double manualRating;

    public double getResponseRatePct() {
        return rfqsReceived == 0 ? 0 : Math.round(rfqsResponded * 1000.0 / rfqsReceived) / 10.0;
    }

    /** Weighted 0..100 score used to rank vendors during RFQ vendor selection. */
    public double getOverallScore() {
        double score = getResponseRatePct() * 0.2
                + onTimeDeliveryPct * 0.3
                + qualityAcceptancePct * 0.3
                + (manualRating / 5.0 * 100) * 0.2;
        return Math.round(score * 10) / 10.0;
    }
}
