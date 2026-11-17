package com.schoolerp.inventory.web.dto;

import com.schoolerp.inventory.model.GoodsReceipt;
import com.schoolerp.inventory.model.Item;
import com.schoolerp.inventory.model.PurchaseOrder;
import com.schoolerp.inventory.model.StockMovement;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** Payloads for goods receipt and stock. */
public final class InventoryDtos {
    private InventoryDtos() {}

    public record GrnRequest(
            @NotBlank String purchaseOrderId,
            @Min(0) int acceptedQuantity,
            @Min(0) int rejectedQuantity,
            String rejectionReason,
            String deliveryChallan,
            String invoiceNumber,
            BigDecimal invoiceAmount,
            LocalDate receivedDate,
            String receivedBy,
            String inspectedBy,
            String storeLocation,
            String notes) {}

    public record IssueRequest(
            @NotBlank String itemId,
            @Min(1) int quantity,
            @NotBlank String department,
            String issuedTo,
            String purpose,
            String by) {}

    public record AdjustmentRequest(
            @NotBlank String itemId,
            /** Signed: +found / -damaged, lost, count difference. */
            @NotNull Integer quantity,
            @NotBlank String reason,
            String by) {}

    public record StockSettings(@Min(0) int reorderLevel, @Min(0) int reorderQuantity, String location) {}

    public record ReceivablePo(PurchaseOrder order, List<GoodsReceipt> receipts, Item item) {}

    public record ItemDetail(Item item, String categoryName, List<StockMovement> movements,
                             List<PurchaseOrder> openOrders, int issuedLast30Days,
                             String openRequestId, String openRequestNumber) {}
}
