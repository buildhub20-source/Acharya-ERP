package com.schoolerp.inventory.service;

import com.schoolerp.inventory.model.Category;
import com.schoolerp.inventory.model.Enums.PoStatus;
import com.schoolerp.inventory.model.Enums.PrStatus;
import com.schoolerp.inventory.model.Enums.VendorStatus;
import com.schoolerp.inventory.model.GoodsReceipt;
import com.schoolerp.inventory.model.PurchaseOrder;
import com.schoolerp.inventory.model.PurchaseRequest;
import com.schoolerp.inventory.model.Quote;
import com.schoolerp.inventory.model.Rfq;
import com.schoolerp.inventory.model.Vendor;
import com.schoolerp.inventory.repository.Repositories.CategoryRepository;
import com.schoolerp.inventory.repository.Repositories.GoodsReceiptRepository;
import com.schoolerp.inventory.repository.Repositories.PurchaseOrderRepository;
import com.schoolerp.inventory.repository.Repositories.PurchaseRequestRepository;
import com.schoolerp.inventory.repository.Repositories.QuoteRepository;
import com.schoolerp.inventory.repository.Repositories.RfqRepository;
import com.schoolerp.inventory.repository.Repositories.VendorRepository;
import com.schoolerp.inventory.web.ApiException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Read-only views across vendors: one vendor's trading history, and module-level reports. */
@Service
public class VendorInsightsService {

    private final VendorRepository vendors;
    private final CategoryRepository categories;
    private final RfqRepository rfqs;
    private final QuoteRepository quotes;
    private final PurchaseRequestRepository requests;
    private final PurchaseOrderRepository orders;
    private final GoodsReceiptRepository receipts;

    @Value("${app.rfq.min-quotes:3}")
    private int minQuotes;

    /** Share of total spend above which a single vendor is flagged as a dependency risk. */
    private static final double CONCENTRATION_PCT = 40.0;

    public VendorInsightsService(VendorRepository vendors, CategoryRepository categories, RfqRepository rfqs,
                                 QuoteRepository quotes, PurchaseRequestRepository requests, PurchaseOrderRepository orders,
                                 GoodsReceiptRepository receipts) {
        this.vendors = vendors;
        this.categories = categories;
        this.rfqs = rfqs;
        this.quotes = quotes;
        this.requests = requests;
        this.orders = orders;
        this.receipts = receipts;
    }

    // ------------------------------------------------------------------ one vendor

    public record RfqHistory(String rfqId, String reference, String purchaseRequestId, String purchaseRequestNumber,
                             String title, LocalDateTime sentAt, String rfqStatus, BigDecimal quotedAmount,
                             Integer rank, Integer competitors, String outcome) {}

    public record Activity(List<RfqHistory> rfqs, List<PurchaseOrder> orders, List<GoodsReceipt> receipts,
                           int quoted, int won, BigDecimal totalSpend, BigDecimal openOrderValue, double winRatePct) {}

    public Activity activity(String vendorId) {
        vendors.findById(vendorId).orElseThrow(() -> ApiException.notFound("Vendor", vendorId));
        List<RfqHistory> history = rfqs.findByVendor(vendorId).stream()
                .sorted(Comparator.comparing(Rfq::getSentAt).reversed())
                .map(this::history)
                .toList();
        List<PurchaseOrder> pos = orders.findAll().stream().filter(o -> o.getVendorId().equals(vendorId))
                .sorted(Comparator.comparing(PurchaseOrder::getIssuedAt).reversed()).toList();
        List<GoodsReceipt> grns = receipts.findAll().stream().filter(g -> g.getVendorId().equals(vendorId))
                .sorted(Comparator.comparing(GoodsReceipt::getCreatedAt).reversed()).toList();
        int quoted = (int) history.stream().filter(h -> h.quotedAmount() != null).count();
        int won = (int) history.stream().filter(h -> "WON".equals(h.outcome())).count();
        BigDecimal spend = pos.stream().filter(o -> o.getStatus() != PoStatus.CANCELLED)
                .map(PurchaseOrder::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal open = pos.stream().filter(o -> o.getPendingQuantity() > 0 && o.getStatus() != PoStatus.CANCELLED)
                .map(o -> o.getUnitCost().multiply(BigDecimal.valueOf(o.getPendingQuantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
        double winRate = quoted == 0 ? 0 : Math.round(won * 1000.0 / quoted) / 10.0;
        return new Activity(history, pos, grns, quoted, won, spend, open, winRate);
    }

    private RfqHistory history(Rfq r) {
        PurchaseRequest pr = requests.findById(r.getPurchaseRequestId()).orElse(null);
        List<Quote> roundQuotes = quotes.findByPurchaseRequest(r.getPurchaseRequestId()).stream()
                .filter(q -> q.getRound() == r.getRound())
                .collect(Collectors.toMap(Quote::getVendorId, q -> q, (a, b) -> a.getVersion() >= b.getVersion() ? a : b))
                .values().stream().sorted(Comparator.comparing(Quote::getLandedCost)).toList();
        Quote mine = roundQuotes.stream().filter(q -> q.getVendorId().equals(r.getVendorId())).findFirst().orElse(null);
        Integer rank = mine == null ? null : roundQuotes.indexOf(mine) + 1;
        String outcome;
        if (pr == null) outcome = "UNKNOWN";
        else if (r.getRound() != pr.getRound()) outcome = "REQUOTED";
        else if (pr.getStatus() == PrStatus.PO_ISSUED) outcome = r.getVendorId().equals(pr.getSelectedVendorId()) ? "WON" : "NOT_SELECTED";
        else if (pr.getStatus() == PrStatus.CANCELLED) outcome = "CANCELLED";
        else if (mine == null) outcome = r.getStatus().name().equals("NO_RESPONSE") ? "NO_RESPONSE" : "AWAITING_QUOTE";
        else outcome = "UNDER_EVALUATION";
        return new RfqHistory(r.getId(), r.getReference(), r.getPurchaseRequestId(), pr == null ? null : pr.getNumber(),
                pr == null ? null : pr.getTitle(), r.getSentAt(), r.getStatus().name(),
                mine == null ? null : mine.getLandedCost(), rank, roundQuotes.size(), outcome);
    }

    // ------------------------------------------------------------------ module reports

    public record SpendRow(String vendorId, String vendorName, int poCount, BigDecimal spend, double sharePct, boolean concentrated) {}

    public record CoverageRow(String categoryId, String categoryName, int active, int total, boolean belowMinimum) {}

    public record ScoreRow(String vendorId, String vendorName, VendorStatus status, double score, double responseRatePct,
                           double onTimePct, double qualityPct, double rating, int quotesWon, double avgResponseHours) {}

    public record Reports(BigDecimal totalSpend, List<SpendRow> spend, List<CoverageRow> coverage, List<ScoreRow> scorecard,
                          Map<VendorStatus, Long> statusCounts, int minQuotesRequired, double concentrationThresholdPct) {}

    public Reports reports() {
        List<Vendor> all = vendors.findAll();
        Map<String, Vendor> byId = all.stream().collect(Collectors.toMap(Vendor::getId, v -> v));
        List<PurchaseOrder> live = orders.findAll().stream().filter(o -> o.getStatus() != PoStatus.CANCELLED).toList();
        BigDecimal total = live.stream().map(PurchaseOrder::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);

        List<SpendRow> spend = live.stream().collect(Collectors.groupingBy(PurchaseOrder::getVendorId)).entrySet().stream()
                .map(e -> {
                    BigDecimal s = e.getValue().stream().map(PurchaseOrder::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
                    double share = total.signum() == 0 ? 0 : s.multiply(BigDecimal.valueOf(100)).divide(total, 1, RoundingMode.HALF_UP).doubleValue();
                    Vendor v = byId.get(e.getKey());
                    return new SpendRow(e.getKey(), v == null ? e.getKey() : v.getDisplayName(), e.getValue().size(), s, share,
                            share > CONCENTRATION_PCT && live.size() > 2);
                })
                .sorted(Comparator.comparing(SpendRow::spend).reversed())
                .toList();

        List<CoverageRow> coverage = categories.findAll().stream()
                .sorted(Comparator.comparing(Category::getName))
                .map(c -> {
                    int totalIn = (int) all.stream().filter(v -> v.getCategoryIds().contains(c.getId())).count();
                    int active = (int) all.stream().filter(v -> v.getCategoryIds().contains(c.getId()) && v.isRfqEligible()).count();
                    return new CoverageRow(c.getId(), c.getName(), active, totalIn, active < minQuotes);
                })
                .toList();

        List<ScoreRow> scorecard = all.stream()
                .filter(v -> v.getStatus() == VendorStatus.ACTIVE || v.getStatus() == VendorStatus.SUSPENDED)
                .map(v -> {
                    var p = v.getPerformance();
                    return new ScoreRow(v.getId(), v.getDisplayName(), v.getStatus(), p.getOverallScore(), p.getResponseRatePct(),
                            p.getOnTimeDeliveryPct(), p.getQualityAcceptancePct(), p.getManualRating(), p.getQuotesWon(), p.getAvgResponseHours());
                })
                .sorted(Comparator.comparingDouble(ScoreRow::score).reversed())
                .toList();

        Map<VendorStatus, Long> statusCounts = all.stream().collect(Collectors.groupingBy(Vendor::getStatus, Collectors.counting()));
        return new Reports(total, spend, coverage, scorecard, statusCounts, minQuotes, CONCENTRATION_PCT);
    }
}
