package com.schoolerp.inventory.repository;

import com.schoolerp.inventory.model.Category;
import com.schoolerp.inventory.model.GoodsReceipt;
import com.schoolerp.inventory.model.StockMovement;
import com.schoolerp.inventory.model.Item;
import com.schoolerp.inventory.model.PurchaseOrder;
import com.schoolerp.inventory.model.PurchaseRequest;
import com.schoolerp.inventory.model.Quote;
import com.schoolerp.inventory.model.Rfq;
import com.schoolerp.inventory.model.Vendor;
import java.util.List;
import org.springframework.stereotype.Repository;

/** Concrete repositories: in memory, persisted to Supabase when SUPABASE_DB_URL is set. */
public final class Repositories {
    private Repositories() {}

    @Repository
    public static class CategoryRepository extends InMemoryRepository<Category> {
        public CategoryRepository() { super("CAT", Category::getId, Category.class); }
    }

    @Repository
    public static class ItemRepository extends InMemoryRepository<Item> {
        public ItemRepository() { super("ITM", Item::getId, Item.class); }
    }

    @Repository
    public static class VendorRepository extends InMemoryRepository<Vendor> {
        public VendorRepository() { super("VEN", Vendor::getId, Vendor.class); }

        public boolean existsByGstin(String gstin, String excludeId) {
            return gstin != null && !gstin.isBlank() && findAll().stream()
                    .anyMatch(v -> gstin.equalsIgnoreCase(v.getGstin()) && !v.getId().equals(excludeId));
        }
    }

    @Repository
    public static class PurchaseRequestRepository extends InMemoryRepository<PurchaseRequest> {
        public PurchaseRequestRepository() { super("PR", PurchaseRequest::getId, PurchaseRequest.class); }
    }

    @Repository
    public static class RfqRepository extends InMemoryRepository<Rfq> {
        public RfqRepository() { super("RFQ", Rfq::getId, Rfq.class); }

        public List<Rfq> findByPurchaseRequest(String prId) {
            return findWhere(r -> r.getPurchaseRequestId().equals(prId));
        }

        public List<Rfq> findByVendor(String vendorId) {
            return findWhere(r -> r.getVendorId().equals(vendorId));
        }
    }

    @Repository
    public static class QuoteRepository extends InMemoryRepository<Quote> {
        public QuoteRepository() { super("QT", Quote::getId, Quote.class); }

        public List<Quote> findByPurchaseRequest(String prId) {
            return findWhere(q -> q.getPurchaseRequestId().equals(prId));
        }

        public List<Quote> findByRfq(String rfqId) {
            return findWhere(q -> q.getRfqId().equals(rfqId));
        }
    }

    @Repository
    public static class PurchaseOrderRepository extends InMemoryRepository<PurchaseOrder> {
        public PurchaseOrderRepository() { super("PO", PurchaseOrder::getId, PurchaseOrder.class); }
    }

    @Repository
    public static class GoodsReceiptRepository extends InMemoryRepository<GoodsReceipt> {
        public GoodsReceiptRepository() { super("GRN", GoodsReceipt::getId, GoodsReceipt.class); }

        public List<GoodsReceipt> findByPurchaseOrder(String poId) {
            return findWhere(g -> g.getPurchaseOrderId().equals(poId));
        }
    }

    @Repository
    public static class StockMovementRepository extends InMemoryRepository<StockMovement> {
        public StockMovementRepository() { super("MOV", StockMovement::getId, StockMovement.class); }

        public List<StockMovement> findByItem(String itemId) {
            return findWhere(m -> m.getItemId().equals(itemId));
        }
    }
}
