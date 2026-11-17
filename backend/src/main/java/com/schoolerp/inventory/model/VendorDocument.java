package com.schoolerp.inventory.model;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class VendorDocument {
    private String id;
    /** GST_CERT, PAN, TRADE_LICENCE, FSSAI, MSME, INSURANCE, CANCELLED_CHEQUE */
    private String type;
    private String number;
    private LocalDate issueDate;
    /** null = never expires */
    private LocalDate expiryDate;
    private Enums.DocVerification verification;
    private String fileName;

    public boolean isExpired() {
        return expiryDate != null && expiryDate.isBefore(LocalDate.now());
    }

    public Long getDaysToExpiry() {
        return expiryDate == null ? null : ChronoUnit.DAYS.between(LocalDate.now(), expiryDate);
    }
}
