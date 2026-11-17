package com.schoolerp.inventory.service;

import com.schoolerp.inventory.model.AuditEntry;
import com.schoolerp.inventory.model.Enums.PrStatus;
import com.schoolerp.inventory.model.Enums.VendorStatus;
import com.schoolerp.inventory.model.PurchaseOrder;
import com.schoolerp.inventory.model.PurchaseRequest;
import com.schoolerp.inventory.model.Quote;
import com.schoolerp.inventory.model.Vendor;
import com.schoolerp.inventory.repository.Repositories.PurchaseOrderRepository;
import com.schoolerp.inventory.repository.Repositories.PurchaseRequestRepository;
import com.schoolerp.inventory.repository.Repositories.VendorRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class DashboardService {

    private final VendorService vendorService;
    private final ProcurementService procurement;
    private final VendorRepository vendors;
    private final PurchaseRequestRepository requests;
    private final PurchaseOrderRepository orders;
    private final InventoryService inventory;

    public DashboardService(VendorService vendorService, ProcurementService procurement, VendorRepository vendors,
                            PurchaseRequestRepository requests, PurchaseOrderRepository orders,
                            InventoryService inventory) {
        this.vendorService = vendorService;
        this.procurement = procurement;
        this.vendors = vendors;
        this.requests = requests;
        this.orders = orders;
        this.inventory = inventory;
    }

    public Map<String, Object> summary() {
        vendorService.refreshCompliance();
        List<Vendor> all = vendors.findAll();
        Map<VendorStatus, Long> vendorCounts = all.stream()
                .collect(Collectors.groupingBy(Vendor::getStatus, Collectors.counting()));
        Map<PrStatus, Long> prCounts = procurement.countsByStatus();
        List<PurchaseOrder> pos = orders.findAll();
        BigDecimal poValue = pos.stream().map(PurchaseOrder::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);

        // Savings: for each issued PO, average quote - awarded amount.
        BigDecimal savings = BigDecimal.ZERO;
        for (PurchaseOrder po : pos) {
            PurchaseRequest pr = procurement.get(po.getPurchaseRequestId());
            List<Quote> qs = procurement.latestQuotesForRound(pr);
            if (qs.size() > 1) {
                BigDecimal avg = qs.stream().map(Quote::getLandedCost).reduce(BigDecimal.ZERO, BigDecimal::add)
                        .divide(BigDecimal.valueOf(qs.size()), 2, RoundingMode.HALF_UP);
                savings = savings.add(avg.subtract(po.getAmount()).max(BigDecimal.ZERO));
            }
        }

        List<Map<String, Object>> activity = requests.findAll().stream()
                .flatMap(pr -> pr.getAudit().stream().map(a -> activity(pr, a)))
                .sorted(Comparator.comparing((Map<String, Object> m) -> m.get("at").toString()).reversed())
                .limit(10)
                .toList();

        List<Map<String, Object>> topVendors = all.stream()
                .filter(v -> v.getStatus() == VendorStatus.ACTIVE)
                .sorted(Comparator.comparingDouble((Vendor v) -> v.getPerformance().getOverallScore()).reversed())
                .limit(5)
                .map(v -> Map.<String, Object>of("id", v.getId(), "name", v.getDisplayName(),
                        "score", v.getPerformance().getOverallScore(),
                        "rating", v.getPerformance().getManualRating(),
                        "responseRate", v.getPerformance().getResponseRatePct()))
                .toList();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("vendorCounts", vendorCounts);
        out.put("totalVendors", all.size());
        out.put("prCounts", prCounts);
        out.put("openRequests", prCounts.entrySet().stream()
                .filter(e -> e.getKey() != PrStatus.PO_ISSUED && e.getKey() != PrStatus.CANCELLED)
                .mapToLong(Map.Entry::getValue).sum());
        out.put("pendingApprovals", prCounts.getOrDefault(PrStatus.PENDING_APPROVAL, 0L));
        out.put("pendingVendorVerification", vendorCounts.getOrDefault(VendorStatus.PENDING_VERIFICATION, 0L));
        out.put("poCount", pos.size());
        out.put("poValue", poValue);
        out.put("estimatedSavings", savings);
        out.put("expiringDocuments", vendorService.expiringDocuments(30));
        out.put("pendingBankChanges", all.stream().filter(v -> v.getPendingBankChange() != null)
                .map(v -> Map.of("id", v.getId(), "name", v.getDisplayName())).toList());
        out.put("topVendors", topVendors);
        out.put("recentActivity", activity);
        out.put("stockValue", inventory.totalStockValue());
        out.put("reorderItems", inventory.needsReorder().stream()
                .map(i -> Map.<String, Object>of("id", i.getId(), "name", i.getName(), "onHand", i.getOnHand(),
                        "reorderLevel", i.getReorderLevel(), "unit", i.getUnit()))
                .toList());
        List<PurchaseOrder> pending = inventory.pendingDeliveries();
        out.put("pendingDeliveries", pending.size());
        out.put("overdueDeliveries", pending.stream().filter(PurchaseOrder::isOverdue).count());
        return out;
    }

    private Map<String, Object> activity(PurchaseRequest pr, AuditEntry a) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("at", a.getAt());
        m.put("by", a.getBy());
        m.put("action", a.getAction());
        m.put("details", a.getDetails());
        m.put("prId", pr.getId());
        m.put("prNumber", pr.getNumber());
        m.put("prTitle", pr.getTitle());
        return m;
    }
}
