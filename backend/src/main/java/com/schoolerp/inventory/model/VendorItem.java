package com.schoolerp.inventory.model;

import java.math.BigDecimal;
import java.time.LocalDate;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** One line of a vendor's catalogue: an item master entry it supplies, on its usual terms. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class VendorItem {
    private String itemId;
    private String itemName;
    private String unit;
    /** Typical unit price before tax, from the vendor's rate card or last quote. */
    private BigDecimal typicalPrice;
    private Integer minOrderQuantity;
    private Integer leadTimeDays;
    private LocalDate updatedOn;
}
