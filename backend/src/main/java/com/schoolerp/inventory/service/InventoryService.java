package com.schoolerp.inventory.service;

import static com.schoolerp.inventory.service.VendorService.actorOr;

import com.schoolerp.inventory.model.AuditEntry;
import com.schoolerp.inventory.model.Enums.InvoiceMatch;
import com.schoolerp.inventory.model.Enums.MovementType;
import com.schoolerp.inventory.model.Enums.PoStatus;
import com.schoolerp.inventory.model.Enums.StockStatus;
import com.schoolerp.inventory.model.GoodsReceipt;
import com.schoolerp.inventory.model.Item;
import com.schoolerp.inventory.model.PurchaseOrder;
import com.schoolerp.inventory.model.PurchaseRequest;
import com.schoolerp.inventory.model.Enums.PrStatus;
import com.schoolerp.inventory.model.StockMovement;
import com.schoolerp.inventory.model.VendorPerformance;
import com.schoolerp.inventory.repository.Repositories.CategoryRepository;
import com.schoolerp.inventory.repository.Repositories.GoodsReceiptRepository;
import com.schoolerp.inventory.repository.Repositories.ItemRepository;
import com.schoolerp.inventory.repository.Repositories.PurchaseOrderRepository;
import com.schoolerp.inventory.repository.Repositories.PurchaseRequestRepository;
import com.schoolerp.inventory.repository.Repositories.StockMovementRepository;
import com.schoolerp.inventory.repository.Repositories.VendorRepository;
import com.schoolerp.inventory.web.ApiException;
import com.schoolerp.inventory.web.dto.InventoryDtos.AdjustmentRequest;
import com.schoolerp.inventory.web.dto.InventoryDtos.GrnRequest;
import com.schoolerp.inventory.web.dto.InventoryDtos.IssueRequest;
import com.schoolerp.inventory.web.dto.InventoryDtos.ItemDetail;
import com.schoolerp.inventory.web.dto.InventoryDtos.ReceivablePo;
import com.schoolerp.inventory.web.dto.InventoryDtos.StockSettings;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Year;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;

/**
 * Goods receipt (GRN) and the stock ledger. Every change to stock goes through
 * {@link #post} so the ledger always reconciles with the item's on-hand quantity.
 */
@Service
public class InventoryService {

    /** Invoice may differ from accepted value by this much (rounding, small freight) and still match. */
    private static final BigDecimal MATCH_TOLERANCE_PCT = new BigDecimal("1.0");

    private final ItemRepository items;
    private final StockMovementRepository movements;
    private final GoodsReceiptRepository receipts;
    private final PurchaseOrderRepository orders;
    private final PurchaseRequestRepository requests;
    private final VendorRepository vendors;
    private final CategoryRepository categories;
    private final MessagingService messaging;

    public InventoryService(ItemRepository items, StockMovementRepository movements, GoodsReceiptRepository receipts,
                            PurchaseOrderRepository orders, PurchaseRequestRepository requests, VendorRepository vendors,
                            CategoryRepository categories, MessagingService messaging) {
        this.items = items;
        this.movements = movements;
        this.receipts = receipts;
        this.orders = orders;
        this.requests = requests;
        this.vendors = vendors;
        this.categories = categories;
        this.messaging = messaging;
    }

    // ------------------------------------------------------------------ stock queries

    public List<Item> stock(String categoryId, String status, String q) {
        String query = q == null ? "" : q.toLowerCase(Locale.ROOT).trim();
        return items.findAll().stream()
                .filter(i -> categoryId == null || categoryId.isBlank() || categoryId.equals(i.getCategoryId()))
                .filter(i -> status == null || status.isBlank()
                        || ("ATTENTION".equalsIgnoreCase(status) ? i.getStockStatus() != StockStatus.OK
                            : i.getStockStatus().name().equalsIgnoreCase(status)))
                .filter(i -> query.isEmpty() || i.getName().toLowerCase(Locale.ROOT).contains(query)
                        || i.getSku().toLowerCase(Locale.ROOT).contains(query))
                .sorted(Comparator.comparing((Item i) -> i.getStockStatus().ordinal()).reversed()
                        .thenComparing(Item::getName))
                .toList();
    }

    public Item item(String id) {
        return items.findById(id).orElseThrow(() -> ApiException.notFound("Item", id));
    }

    public ItemDetail itemDetail(String id) {
        Item item = item(id);
        List<StockMovement> ledger = movements.findByItem(id).stream()
                .sorted(Comparator.comparing(StockMovement::getId).reversed()).toList();
        LocalDateTime since = LocalDateTime.now().minusDays(30);
        int issued = ledger.stream().filter(m -> m.getType() == MovementType.ISSUE && m.getAt().isAfter(since))
                .mapToInt(m -> -m.getQuantity()).sum();
        String cat = categories.findById(item.getCategoryId()).map(c -> c.getName()).orElse(item.getCategoryId());
        PurchaseRequest open = openRequestFor(id);
        return new ItemDetail(item, cat, ledger, openOrdersFor(id), issued,
                open == null ? null : open.getId(), open == null ? null : open.getNumber());
    }

    public List<StockMovement> ledger(String type, String itemId, int limit) {
        return movements.findAll().stream()
                .filter(m -> type == null || type.isBlank() || m.getType().name().equalsIgnoreCase(type))
                .filter(m -> itemId == null || itemId.isBlank() || m.getItemId().equals(itemId))
                .sorted(Comparator.comparing(StockMovement::getId).reversed())
                .limit(limit)
                .toList();
    }

    /** Units already on order (issued POs not yet fully received). */
    public int onOrder(String itemId) {
        return openOrdersFor(itemId).stream().mapToInt(PurchaseOrder::getPendingQuantity).sum();
    }

    /** A purchase request for this item that is still in progress (no PO yet), to avoid duplicate requests. */
    public PurchaseRequest openRequestFor(String itemId) {
        return requests.findAll().stream()
                .filter(pr -> !EnumSet.of(PrStatus.PO_ISSUED, PrStatus.CANCELLED).contains(pr.getStatus()))
                .filter(pr -> pr.getLines().stream().anyMatch(l -> itemId.equals(l.getItemId())))
                .findFirst().orElse(null);
    }

    private List<PurchaseOrder> openOrdersFor(String itemId) {
        return orders.findAll().stream()
                .filter(o -> itemId.equals(o.getItemId()) && o.getPendingQuantity() > 0 && o.getStatus() != PoStatus.CANCELLED)
                .toList();
    }

    public Item updateSettings(String id, StockSettings s) {
        Item item = item(id);
        item.setReorderLevel(s.reorderLevel());
        item.setReorderQuantity(s.reorderQuantity());
        item.setLocation(s.location());
        return items.save(item);
    }

    // ------------------------------------------------------------------ goods receipt

    /** POs that still have goods to receive, oldest expected first. */
    public List<PurchaseOrder> pendingDeliveries() {
        return orders.findAll().stream()
                .filter(o -> o.getPendingQuantity() > 0 && o.getStatus() != PoStatus.CANCELLED)
                .sorted(Comparator.comparing(PurchaseOrder::getExpectedDelivery))
                .toList();
    }

    public ReceivablePo receivable(String poId) {
        PurchaseOrder po = orders.findById(poId).orElseThrow(() -> ApiException.notFound("Purchase order", poId));
        Item item = po.getItemId() == null ? null : items.findById(po.getItemId()).orElse(null);
        return new ReceivablePo(po, receiptsFor(poId), item);
    }

    public List<GoodsReceipt> receipts(String vendorId) {
        return receipts.findAll().stream()
                .filter(g -> vendorId == null || g.getVendorId().equals(vendorId))
                .sorted(Comparator.comparing(GoodsReceipt::getCreatedAt).reversed())
                .toList();
    }

    public GoodsReceipt receipt(String id) {
        return receipts.findById(id).orElseThrow(() -> ApiException.notFound("GRN", id));
    }

    private List<GoodsReceipt> receiptsFor(String poId) {
        return receipts.findByPurchaseOrder(poId).stream()
                .sorted(Comparator.comparing(GoodsReceipt::getCreatedAt)).toList();
    }

    public GoodsReceipt receive(GrnRequest req) {
        PurchaseOrder po = orders.findById(req.purchaseOrderId())
                .orElseThrow(() -> ApiException.notFound("Purchase order", req.purchaseOrderId()));
        if (po.getStatus() == PoStatus.CANCELLED) throw ApiException.badRequest(po.getNumber() + " is cancelled");
        if (po.getPendingQuantity() == 0) throw ApiException.badRequest(po.getNumber() + " is already fully received");
        int received = req.acceptedQuantity() + req.rejectedQuantity();
        if (received <= 0) throw ApiException.badRequest("Enter the quantity received");
        if (req.acceptedQuantity() > po.getPendingQuantity()) {
            throw ApiException.badRequest("Only " + po.getPendingQuantity() + " " + po.getUnit()
                    + " are pending on " + po.getNumber() + "; extra units must be returned to the vendor");
        }
        if (req.rejectedQuantity() > 0 && blank(req.rejectionReason())) {
            throw ApiException.badRequest("Give a reason for the rejected units (damaged, wrong size, spec mismatch…)");
        }
        LocalDate receivedDate = req.receivedDate() != null ? req.receivedDate() : LocalDate.now();
        if (receivedDate.isAfter(LocalDate.now())) throw ApiException.badRequest("Received date cannot be in the future");
        String actor = actorOr(req.receivedBy(), "Store Keeper");

        Item item = ensureItem(po, req.storeLocation());

        GoodsReceipt grn = new GoodsReceipt();
        grn.setId(receipts.nextId());
        grn.setNumber("GRN-" + Year.now() + "-" + String.format("%04d", receipts.count() + 1));
        grn.setPurchaseOrderId(po.getId());
        grn.setPurchaseOrderNumber(po.getNumber());
        grn.setPurchaseRequestId(po.getPurchaseRequestId());
        grn.setVendorId(po.getVendorId());
        grn.setVendorName(po.getVendorName());
        grn.setItemId(item.getId());
        grn.setDescription(po.getDescription());
        grn.setUnit(po.getUnit());
        grn.setOrderedQuantity(po.getOrderedQuantity());
        grn.setPreviouslyAccepted(po.getAcceptedQuantity());
        grn.setReceivedQuantity(received);
        grn.setAcceptedQuantity(req.acceptedQuantity());
        grn.setRejectedQuantity(req.rejectedQuantity());
        grn.setRejectionReason(blank(req.rejectionReason()) ? null : req.rejectionReason());
        grn.setUnitCost(po.getUnitCost());
        grn.setDeliveryChallan(req.deliveryChallan());
        grn.setInvoiceNumber(blank(req.invoiceNumber()) ? null : req.invoiceNumber().trim());
        grn.setInvoiceAmount(req.invoiceAmount());
        grn.setInvoiceMatch(matchInvoice(req.invoiceAmount(), grn.getAcceptedValue()));
        grn.setReceivedDate(receivedDate);
        grn.setExpectedDate(po.getExpectedDelivery());
        grn.setOnTime(!receivedDate.isAfter(po.getExpectedDelivery()));
        grn.setReceivedBy(actor);
        grn.setInspectedBy(req.inspectedBy());
        grn.setStoreLocation(item.getLocation());
        grn.setNotes(req.notes());
        grn.setCreatedAt(LocalDateTime.now());
        receipts.save(grn);

        if (req.acceptedQuantity() > 0) {
            post(item, MovementType.RECEIPT, req.acceptedQuantity(), po.getUnitCost(), grn.getNumber(), grn.getId(),
                    null, null, "From " + po.getVendorName() + " against " + po.getNumber(), actor);
            item.setLastPurchasePrice(po.getUnitCost());
            items.save(item);
        }

        po.setReceivedQuantity(po.getReceivedQuantity() + received);
        po.setAcceptedQuantity(po.getAcceptedQuantity() + req.acceptedQuantity());
        po.setRejectedQuantity(po.getRejectedQuantity() + req.rejectedQuantity());
        po.setLastReceivedAt(LocalDateTime.now());
        po.setStatus(po.getPendingQuantity() == 0 ? PoStatus.RECEIVED : PoStatus.PARTIALLY_RECEIVED);
        orders.save(po);

        updateVendorPerformance(po.getVendorId(), grn);
        requests.findById(po.getPurchaseRequestId()).ifPresent(pr -> {
            pr.getAudit().add(0, AuditEntry.of(actor, "GOODS_RECEIVED", grn.getNumber() + ": " + grn.getAcceptedQuantity()
                    + " accepted" + (grn.getRejectedQuantity() > 0 ? ", " + grn.getRejectedQuantity() + " rejected" : "")
                    + (po.getPendingQuantity() > 0 ? ", " + po.getPendingQuantity() + " pending" : ", order complete")));
            requests.save(pr);
        });
        vendors.findById(po.getVendorId()).ifPresent(v -> messaging.notifyVendor(v,
                "Goods received: " + po.getNumber(),
                "We received " + received + " " + po.getUnit() + " against " + po.getNumber() + " (" + grn.getNumber() + "). "
                        + grn.getAcceptedQuantity() + " accepted"
                        + (grn.getRejectedQuantity() > 0 ? "; " + grn.getRejectedQuantity() + " rejected (" + grn.getRejectionReason()
                            + "). Please collect the rejected units and send replacements." : ".")
                        + (po.getPendingQuantity() > 0 ? " Still pending: " + po.getPendingQuantity() + " " + po.getUnit() + "." : "")));
        return grn;
    }

    /** Custom (non-master) PO lines get an item master entry on their first receipt. */
    private Item ensureItem(PurchaseOrder po, String location) {
        Item item = po.getItemId() == null ? null : items.findById(po.getItemId()).orElse(null);
        if (item == null) {
            item = Item.of(items.nextId(), "CUS-" + String.format("%04d", items.count() + 1), po.getDescription(),
                    po.getCategoryId(), po.getUnit() == null ? "pc" : po.getUnit(), po.getUnitCost());
            item.setReorderLevel(0);
            item.setLocation(blank(location) ? "Main store" : location);
            items.save(item);
            po.setItemId(item.getId());
        } else if (!blank(location)) {
            item.setLocation(location);
        }
        return item;
    }

    private InvoiceMatch matchInvoice(BigDecimal invoice, BigDecimal expected) {
        if (invoice == null) return InvoiceMatch.NOT_PROVIDED;
        if (expected.signum() == 0) return invoice.signum() == 0 ? InvoiceMatch.MATCHED : InvoiceMatch.MISMATCH;
        BigDecimal diffPct = invoice.subtract(expected).abs().multiply(BigDecimal.valueOf(100))
                .divide(expected, 2, RoundingMode.HALF_UP);
        return diffPct.compareTo(MATCH_TOLERANCE_PCT) <= 0 ? InvoiceMatch.MATCHED : InvoiceMatch.MISMATCH;
    }

    /**
     * Blends this delivery into the vendor's on-time and quality percentages.
     * Each delivery counts for 20% so recent behaviour moves the score without one bad day dominating.
     */
    private void updateVendorPerformance(String vendorId, GoodsReceipt grn) {
        vendors.findById(vendorId).ifPresent(v -> {
            VendorPerformance p = v.getPerformance();
            double onTime = grn.isOnTime() ? 100 : 0;
            double quality = grn.getReceivedQuantity() == 0 ? 100 : grn.getAcceptedQuantity() * 100.0 / grn.getReceivedQuantity();
            p.setOnTimeDeliveryPct(blend(p.getOnTimeDeliveryPct(), onTime));
            p.setQualityAcceptancePct(blend(p.getQualityAcceptancePct(), quality));
            v.getAudit().add(0, AuditEntry.of(grn.getReceivedBy(), "DELIVERY_RECORDED", grn.getNumber() + ": "
                    + (grn.isOnTime() ? "on time" : "late") + ", " + Math.round(quality) + "% accepted"));
            vendors.save(v);
        });
    }

    private static double blend(double old, double latest) {
        double v = old == 0 ? latest : old * 0.8 + latest * 0.2;
        return Math.round(v * 10) / 10.0;
    }

    // ------------------------------------------------------------------ issue & adjust

    public StockMovement issue(IssueRequest req) {
        Item item = item(req.itemId());
        if (req.quantity() > item.getOnHand()) {
            throw ApiException.badRequest("Only " + item.getOnHand() + " " + item.getUnit() + " of " + item.getName() + " in stock");
        }
        return post(item, MovementType.ISSUE, -req.quantity(), item.getAvgUnitCost(), "ISS-" + String.format("%05d", movements.count() + 1),
                null, req.department(), req.issuedTo(), req.purpose(), actorOr(req.by(), "Store Keeper"));
    }

    public StockMovement adjust(AdjustmentRequest req) {
        Item item = item(req.itemId());
        if (req.quantity() == 0) throw ApiException.badRequest("Adjustment quantity cannot be zero");
        if (item.getOnHand() + req.quantity() < 0) {
            throw ApiException.badRequest("Adjustment would make stock negative (on hand " + item.getOnHand() + ")");
        }
        return post(item, MovementType.ADJUSTMENT, req.quantity(), item.getAvgUnitCost(),
                "ADJ-" + String.format("%05d", movements.count() + 1), null, null, null, req.reason(), actorOr(req.by(), "Store Keeper"));
    }

    /** Opening balance, used by the seeder and when an item is first brought onto the system. */
    public StockMovement openingBalance(Item item, int qty, BigDecimal unitCost, String by) {
        return post(item, MovementType.OPENING, qty, unitCost, "OPENING", null, null, null, "Opening stock", by);
    }

    /** The only place stock changes. Receipts re-average cost; issues and adjustments use current average. */
    private StockMovement post(Item item, MovementType type, int qty, BigDecimal unitCost, String reference, String referenceId,
                               String department, String issuedTo, String reason, String by) {
        if (qty > 0 && EnumSet.of(MovementType.RECEIPT, MovementType.OPENING).contains(type) && unitCost != null) {
            BigDecimal totalValue = item.getAvgUnitCost().multiply(BigDecimal.valueOf(item.getOnHand()))
                    .add(unitCost.multiply(BigDecimal.valueOf(qty)));
            item.setAvgUnitCost(totalValue.divide(BigDecimal.valueOf(item.getOnHand() + qty), 2, RoundingMode.HALF_UP));
        }
        item.setOnHand(item.getOnHand() + qty);
        items.save(item);

        StockMovement m = new StockMovement();
        m.setId(movements.nextId());
        m.setItemId(item.getId());
        m.setItemName(item.getName());
        m.setUnit(item.getUnit());
        m.setType(type);
        m.setQuantity(qty);
        m.setBalanceAfter(item.getOnHand());
        m.setUnitCost(unitCost == null ? item.getAvgUnitCost() : unitCost);
        m.setReference(reference);
        m.setReferenceId(referenceId);
        m.setDepartment(department);
        m.setIssuedTo(issuedTo);
        m.setReason(reason);
        m.setBy(by);
        m.setAt(LocalDateTime.now());
        return movements.save(m);
    }

    // ------------------------------------------------------------------ dashboard

    public BigDecimal totalStockValue() {
        return items.findAll().stream().map(Item::getStockValue).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    public List<Item> needsReorder() {
        return items.findAll().stream()
                // Items with no reorder level (e.g. one-off furniture) are not auto-replenished.
                .filter(i -> i.getReorderLevel() > 0 && i.getStockStatus() != StockStatus.OK
                        && i.getOnHand() + onOrder(i.getId()) <= i.getReorderLevel()
                        && openRequestFor(i.getId()) == null)
                .sorted(Comparator.comparingInt(Item::getOnHand))
                .toList();
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
