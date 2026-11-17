package com.schoolerp.inventory.model;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.NoArgsConstructor;

/** One line of the stock ledger. Quantity is signed: + in, - out. Never edited, only appended. */
@Data
@NoArgsConstructor
public class StockMovement {
    private String id;
    private String itemId;
    private String itemName;
    private String unit;
    private Enums.MovementType type;
    private int quantity;
    private int balanceAfter;
    private BigDecimal unitCost;
    /** GRN / issue / adjustment number this movement came from. */
    private String reference;
    private String referenceId;
    /** For issues: the department receiving the goods. */
    private String department;
    private String issuedTo;
    private String reason;
    private String by;
    private LocalDateTime at;

    public BigDecimal getValue() {
        return unitCost == null ? BigDecimal.ZERO
                : unitCost.multiply(BigDecimal.valueOf(quantity)).setScale(2, RoundingMode.HALF_UP);
    }
}
