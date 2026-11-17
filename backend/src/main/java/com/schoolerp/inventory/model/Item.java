package com.schoolerp.inventory.model;

import java.math.BigDecimal;
import java.math.RoundingMode;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Item master entry (SKU) with its single-store stock position. */
@Data
@NoArgsConstructor
public class Item {
    private String id;
    private String sku;
    private String name;
    private String categoryId;
    private String unit;
    private BigDecimal lastPurchasePrice;

    // ---- stock ----
    private int onHand;
    private int reorderLevel;
    private int reorderQuantity;
    private String location;
    /** Weighted average cost per unit (landed: price + tax + delivery share). */
    private BigDecimal avgUnitCost = BigDecimal.ZERO;

    public static Item of(String id, String sku, String name, String categoryId, String unit, BigDecimal lastPrice) {
        Item i = new Item();
        i.id = id;
        i.sku = sku;
        i.name = name;
        i.categoryId = categoryId;
        i.unit = unit;
        i.lastPurchasePrice = lastPrice;
        return i;
    }

    public BigDecimal getStockValue() {
        return avgUnitCost.multiply(BigDecimal.valueOf(onHand)).setScale(2, RoundingMode.HALF_UP);
    }

    public Enums.StockStatus getStockStatus() {
        if (onHand <= 0) return reorderLevel > 0 ? Enums.StockStatus.OUT : Enums.StockStatus.OK;
        if (onHand <= reorderLevel) return Enums.StockStatus.LOW;
        return Enums.StockStatus.OK;
    }
}
