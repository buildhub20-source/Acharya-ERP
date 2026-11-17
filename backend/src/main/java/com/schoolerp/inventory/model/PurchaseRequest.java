package com.schoolerp.inventory.model;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class PurchaseRequest {
    private String id;
    private String number;
    private String title;
    private String categoryId;
    private String department;
    private String requestedBy;
    private List<PrLine> lines = new ArrayList<>();
    private LocalDate dueDate;
    private String deliveryLocation;
    private String budgetHead;
    private BigDecimal budgetAmount;
    private LocalDateTime quoteDeadline;
    private Enums.PrStatus status;
    /** Increments every time the manager rejects all quotes and re-quotes. */
    private int round = 1;

    private String selectedVendorId;
    private String selectedQuoteId;
    private String selectionJustification;
    private String purchaseOrderId;

    private List<Approval> approvals = new ArrayList<>();
    private List<AuditEntry> audit = new ArrayList<>();
    private LocalDateTime createdAt;

    public int getTotalQuantity() {
        return lines.stream().mapToInt(PrLine::getQuantity).sum();
    }
}
