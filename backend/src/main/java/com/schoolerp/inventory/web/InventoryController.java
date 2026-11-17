package com.schoolerp.inventory.web;

import com.schoolerp.inventory.model.GoodsReceipt;
import com.schoolerp.inventory.model.Item;
import com.schoolerp.inventory.model.PurchaseOrder;
import com.schoolerp.inventory.model.StockMovement;
import com.schoolerp.inventory.service.InventoryService;
import com.schoolerp.inventory.web.dto.InventoryDtos.AdjustmentRequest;
import com.schoolerp.inventory.web.dto.InventoryDtos.GrnRequest;
import com.schoolerp.inventory.web.dto.InventoryDtos.IssueRequest;
import com.schoolerp.inventory.web.dto.InventoryDtos.ItemDetail;
import com.schoolerp.inventory.web.dto.InventoryDtos.ReceivablePo;
import com.schoolerp.inventory.web.dto.InventoryDtos.StockSettings;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class InventoryController {

    private final InventoryService inventory;

    public InventoryController(InventoryService inventory) {
        this.inventory = inventory;
    }

    /** Stock position per item plus what is already on order. */
    public record OpenRequest(String id, String number, String status) {}

    public record StockRow(Item item, int onOrder, boolean needsReorder, OpenRequest openRequest) {}

    @GetMapping("/stock")
    public List<StockRow> stock(@RequestParam(required = false) String category,
                                @RequestParam(required = false) String status,
                                @RequestParam(required = false) String q) {
        List<String> reorder = inventory.needsReorder().stream().map(Item::getId).toList();
        return inventory.stock(category, status, q).stream()
                .map(i -> {
                    var pr = inventory.openRequestFor(i.getId());
                    return new StockRow(i, inventory.onOrder(i.getId()), reorder.contains(i.getId()),
                            pr == null ? null : new OpenRequest(pr.getId(), pr.getNumber(), pr.getStatus().name()));
                })
                .toList();
    }

    @GetMapping("/stock/{itemId}")
    public ItemDetail item(@PathVariable String itemId) {
        return inventory.itemDetail(itemId);
    }

    @PutMapping("/stock/{itemId}/settings")
    public Item settings(@PathVariable String itemId, @Valid @RequestBody StockSettings req) {
        return inventory.updateSettings(itemId, req);
    }

    @PostMapping("/stock/issues")
    @ResponseStatus(HttpStatus.CREATED)
    public StockMovement issue(@Valid @RequestBody IssueRequest req) {
        return inventory.issue(req);
    }

    @PostMapping("/stock/adjustments")
    @ResponseStatus(HttpStatus.CREATED)
    public StockMovement adjust(@Valid @RequestBody AdjustmentRequest req) {
        return inventory.adjust(req);
    }

    @GetMapping("/stock/movements")
    public List<StockMovement> movements(@RequestParam(required = false) String type,
                                         @RequestParam(required = false) String itemId,
                                         @RequestParam(defaultValue = "200") int limit) {
        return inventory.ledger(type, itemId, limit);
    }

    @GetMapping("/grns/pending")
    public List<PurchaseOrder> pendingDeliveries() {
        return inventory.pendingDeliveries();
    }

    @GetMapping("/grns/receivable/{poId}")
    public ReceivablePo receivable(@PathVariable String poId) {
        return inventory.receivable(poId);
    }

    @GetMapping("/grns")
    public List<GoodsReceipt> receipts(@RequestParam(required = false) String vendorId) {
        return inventory.receipts(vendorId);
    }

    @GetMapping("/grns/{id}")
    public GoodsReceipt receipt(@PathVariable String id) {
        return inventory.receipt(id);
    }

    @PostMapping("/grns")
    @ResponseStatus(HttpStatus.CREATED)
    public GoodsReceipt receive(@Valid @RequestBody GrnRequest req) {
        return inventory.receive(req);
    }
}
