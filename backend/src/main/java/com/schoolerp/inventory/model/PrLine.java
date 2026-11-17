package com.schoolerp.inventory.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** One line of a purchase request, e.g. "Sports shoes, white, size 7" x 5. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class PrLine {
    private String itemId;
    private String description;
    private String specs;
    private int quantity;
    private String unit;
}
