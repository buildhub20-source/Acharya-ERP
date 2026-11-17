package com.schoolerp.inventory.service;

import static com.schoolerp.inventory.service.VendorService.actorOr;

import com.schoolerp.inventory.model.Approval;
import com.schoolerp.inventory.model.AuditEntry;
import com.schoolerp.inventory.model.Enums.ApprovalDecision;
import com.schoolerp.inventory.model.Enums.ApprovalLevel;
import com.schoolerp.inventory.model.Enums.Channel;
import com.schoolerp.inventory.model.Enums.PoStatus;
import com.schoolerp.inventory.model.Enums.PrStatus;
import com.schoolerp.inventory.model.Enums.QuoteSource;
import com.schoolerp.inventory.model.Enums.RfqStatus;
import com.schoolerp.inventory.model.PrLine;
import com.schoolerp.inventory.model.PurchaseOrder;
import com.schoolerp.inventory.model.PurchaseRequest;
import com.schoolerp.inventory.model.Quote;
import com.schoolerp.inventory.model.Rfq;
import com.schoolerp.inventory.model.Vendor;
import com.schoolerp.inventory.repository.Repositories.CategoryRepository;
import com.schoolerp.inventory.repository.Repositories.PurchaseOrderRepository;
import com.schoolerp.inventory.repository.Repositories.PurchaseRequestRepository;
import com.schoolerp.inventory.repository.Repositories.QuoteRepository;
import com.schoolerp.inventory.repository.Repositories.RfqRepository;
import com.schoolerp.inventory.repository.Repositories.VendorRepository;
import com.schoolerp.inventory.web.ApiException;
import com.schoolerp.inventory.web.dto.Dtos.ApprovalPolicy;
import com.schoolerp.inventory.web.dto.Dtos.Comparison;
import com.schoolerp.inventory.web.dto.Dtos.ComparisonRow;
import com.schoolerp.inventory.web.dto.Dtos.ManagerReviewRequest;
import com.schoolerp.inventory.web.dto.Dtos.OfficialDecisionRequest;
import com.schoolerp.inventory.web.dto.Dtos.PurchaseRequestCreate;
import com.schoolerp.inventory.web.dto.Dtos.PurchaseRequestDetail;
import com.schoolerp.inventory.web.dto.Dtos.QuoteSubmission;
import com.schoolerp.inventory.web.dto.Dtos.RawReplyRequest;
import com.schoolerp.inventory.web.dto.Dtos.SendRfqRequest;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.Year;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class ProcurementService {

    private final PurchaseRequestRepository requests;
    private final RfqRepository rfqs;
    private final QuoteRepository quotes;
    private final PurchaseOrderRepository orders;
    private final VendorRepository vendors;
    private final CategoryRepository categories;
    private final MessagingService messaging;
    private final QuoteParserService parser;
    private final Random random = new Random(42);

    @Value("${app.approval.official-threshold:10000}")
    private BigDecimal officialThreshold;

    @Value("${app.rfq.min-quotes:3}")
    private int minQuotes;

    @Value("${app.rfq.max-reminders:3}")
    private int maxReminders;

    public ProcurementService(PurchaseRequestRepository requests, RfqRepository rfqs, QuoteRepository quotes,
                              PurchaseOrderRepository orders, VendorRepository vendors, CategoryRepository categories,
                              MessagingService messaging, QuoteParserService parser) {
        this.requests = requests;
        this.rfqs = rfqs;
        this.quotes = quotes;
        this.orders = orders;
        this.vendors = vendors;
        this.categories = categories;
        this.messaging = messaging;
        this.parser = parser;
    }

    // ------------------------------------------------------------------ queries

    public List<PurchaseRequest> list(String status) {
        return requests.findAll().stream()
                .filter(p -> status == null || status.isBlank() || p.getStatus().name().equalsIgnoreCase(status))
                .sorted(Comparator.comparing(PurchaseRequest::getCreatedAt).reversed())
                .toList();
    }

    public PurchaseRequest get(String id) {
        return requests.findById(id).orElseThrow(() -> ApiException.notFound("Purchase request", id));
    }

    public PurchaseRequestDetail detail(String id) {
        PurchaseRequest pr = get(id);
        List<Rfq> prRfqs = rfqs.findByPurchaseRequest(id).stream()
                .sorted(Comparator.comparing(Rfq::getRound).reversed().thenComparing(Rfq::getVendorName))
                .toList();
        List<Quote> prQuotes = quotes.findByPurchaseRequest(id).stream()
                .sorted(Comparator.comparing(Quote::getReceivedAt).reversed())
                .toList();
        Comparison comparison = compare(pr);
        String category = categories.findById(pr.getCategoryId()).map(c -> c.getName()).orElse(pr.getCategoryId());
        PurchaseOrder po = pr.getPurchaseOrderId() == null ? null : orders.findById(pr.getPurchaseOrderId()).orElse(null);
        return new PurchaseRequestDetail(pr, category, prRfqs, prQuotes, comparison, policyFor(pr, comparison), po);
    }

    public List<PurchaseOrder> purchaseOrders(String vendorId) {
        return orders.findAll().stream()
                .filter(o -> vendorId == null || o.getVendorId().equals(vendorId))
                .sorted(Comparator.comparing(PurchaseOrder::getIssuedAt).reversed())
                .toList();
    }

    /** Latest quote per vendor for the current round, ranked by landed cost. */
    public Comparison compare(PurchaseRequest pr) {
        List<Quote> current = latestQuotesForRound(pr);
        List<Quote> ranked = current.stream()
                .filter(q -> q.getUnitPrice() != null && q.getUnitPrice().signum() > 0)
                .sorted(Comparator.comparing(Quote::getLandedCost))
                .toList();
        int invited = (int) rfqs.findByPurchaseRequest(pr.getId()).stream()
                .filter(r -> r.getRound() == pr.getRound()).count();
        if (ranked.isEmpty()) {
            return new Comparison(List.of(), null, null, null, 0, invited, minQuotes, false);
        }
        BigDecimal l1 = ranked.get(0).getLandedCost();
        BigDecimal avg = ranked.stream().map(Quote::getLandedCost).reduce(BigDecimal.ZERO, BigDecimal::add)
                .divide(BigDecimal.valueOf(ranked.size()), 2, RoundingMode.HALF_UP);
        List<ComparisonRow> rows = new ArrayList<>();
        for (int i = 0; i < ranked.size(); i++) {
            Quote q = ranked.get(i);
            Vendor v = vendors.findById(q.getVendorId()).orElse(null);
            double diff = l1.signum() == 0 ? 0 : q.getLandedCost().subtract(l1)
                    .multiply(BigDecimal.valueOf(100)).divide(l1, 1, RoundingMode.HALF_UP).doubleValue();
            rows.add(new ComparisonRow(i + 1, q, i == 0, diff,
                    v == null ? 0 : v.getPerformance().getOverallScore(),
                    v == null ? 0 : v.getPerformance().getManualRating()));
        }
        return new Comparison(rows, ranked.get(0).getId(), l1, avg, ranked.size(), invited, minQuotes,
                ranked.size() >= minQuotes);
    }

    private ApprovalPolicy policyFor(PurchaseRequest pr, Comparison c) {
        BigDecimal amount = null;
        if (pr.getSelectedQuoteId() != null) {
            amount = quotes.findById(pr.getSelectedQuoteId()).map(Quote::getLandedCost).orElse(null);
        }
        if (amount == null) amount = c.l1Amount();
        if (amount == null) {
            return new ApprovalPolicy(officialThreshold, false, false, "Awaiting quotes");
        }
        boolean overBudget = pr.getBudgetAmount() != null && amount.compareTo(pr.getBudgetAmount()) > 0;
        boolean overThreshold = amount.compareTo(officialThreshold) > 0;
        String reason = overBudget
                ? "Exceeds budget of Rs " + pr.getBudgetAmount() + " - escalated to higher official"
                : overThreshold
                    ? "Amount above Rs " + officialThreshold + " needs second-level sign-off"
                    : "Within manager's approval limit (Rs " + officialThreshold + ")";
        return new ApprovalPolicy(officialThreshold, overBudget || overThreshold, overBudget, reason);
    }

    // ------------------------------------------------------------------ step 1: create PO request

    public PurchaseRequest create(PurchaseRequestCreate req) {
        if (categories.findById(req.categoryId()).isEmpty()) {
            throw ApiException.badRequest("Unknown category " + req.categoryId());
        }
        req.lines().forEach(l -> {
            if (l.getQuantity() <= 0) throw ApiException.badRequest("Quantity must be positive for " + l.getDescription());
        });
        PurchaseRequest pr = new PurchaseRequest();
        pr.setId(requests.nextId());
        pr.setNumber("PR-" + Year.now() + "-" + String.format("%04d", requests.count() + 1));
        pr.setTitle(req.title());
        pr.setCategoryId(req.categoryId());
        pr.setDepartment(req.department());
        pr.setRequestedBy(req.requestedBy());
        pr.setLines(new ArrayList<>(req.lines()));
        pr.setDueDate(req.dueDate());
        pr.setDeliveryLocation(req.deliveryLocation());
        pr.setBudgetHead(req.budgetHead());
        pr.setBudgetAmount(req.budgetAmount());
        pr.setStatus(PrStatus.DRAFT);
        pr.setCreatedAt(LocalDateTime.now());
        audit(pr, req.requestedBy(), "CREATED", pr.getTotalQuantity() + " units requested");
        return requests.save(pr);
    }

    /** Vendors to suggest in step 2: active, in the category, ranked by score. */
    public List<Vendor> suggestedVendors(String prId) {
        PurchaseRequest pr = get(prId);
        String itemId = pr.getLines().isEmpty() ? null : pr.getLines().get(0).getItemId();
        return vendors.findAll().stream()
                .filter(v -> v.getCategoryIds().contains(pr.getCategoryId()))
                .sorted(Comparator.comparing(Vendor::isRfqEligible).reversed()
                        // vendors whose catalogue lists this exact item come first
                        .thenComparing((Vendor v) -> itemId != null && v.getCatalogue().stream().anyMatch(c -> itemId.equals(c.getItemId())),
                                Comparator.reverseOrder())
                        .thenComparing(Comparator.comparingDouble((Vendor v) -> v.getPerformance().getOverallScore()).reversed()))
                .toList();
    }

    // ------------------------------------------------------------------ steps 2-4: select vendors, generate & send RFQ

    public PurchaseRequestDetail sendRfq(String prId, SendRfqRequest req) {
        PurchaseRequest pr = get(prId);
        if (!EnumSet.of(PrStatus.DRAFT, PrStatus.REJECTED_REQUOTE, PrStatus.RFQ_SENT, PrStatus.COLLECTING_QUOTES)
                .contains(pr.getStatus())) {
            throw ApiException.badRequest("RFQs cannot be sent while the request is " + pr.getStatus());
        }
        // Inviting more vendors mid-round keeps the existing deadline unless a new one is given.
        LocalDateTime deadline = req.quoteDeadline() != null ? req.quoteDeadline()
                : isCollecting(pr) && pr.getQuoteDeadline() != null ? pr.getQuoteDeadline()
                : LocalDateTime.now().plusDays(3);
        if (deadline.isBefore(LocalDateTime.now())) throw ApiException.badRequest("Quote deadline must be in the future");
        pr.setQuoteDeadline(deadline);

        List<String> alreadyInvited = rfqs.findByPurchaseRequest(prId).stream()
                .filter(r -> r.getRound() == pr.getRound()).map(Rfq::getVendorId).toList();
        int sent = 0;
        for (String vendorId : req.vendorIds()) {
            if (alreadyInvited.contains(vendorId)) continue;
            Vendor v = vendors.findById(vendorId).orElseThrow(() -> ApiException.notFound("Vendor", vendorId));
            if (!v.isRfqEligible()) {
                throw ApiException.badRequest(v.getDisplayName() + " is " + v.getStatus() + " and cannot receive RFQs");
            }
            Rfq rfq = new Rfq();
            rfq.setId(rfqs.nextId());
            rfq.setReference("RFQ-" + Year.now() + "-" + String.format("%04d", rfqs.count() + 1));
            rfq.setPurchaseRequestId(prId);
            rfq.setRound(pr.getRound());
            rfq.setVendorId(v.getId());
            rfq.setVendorName(v.getDisplayName());
            rfq.setChannels(channelsFor(v));
            rfq.setStatus(RfqStatus.SENT);
            rfq.setSentAt(LocalDateTime.now());
            rfq.setMessage(messaging.buildRfqMessage(pr, rfq, v));
            rfqs.save(rfq);
            messaging.sendRfq(rfq, v);
            v.getPerformance().setRfqsReceived(v.getPerformance().getRfqsReceived() + 1);
            sent++;
        }
        if (sent == 0) throw ApiException.badRequest("All selected vendors already have this RFQ");
        if (pr.getStatus() == PrStatus.DRAFT || pr.getStatus() == PrStatus.REJECTED_REQUOTE) {
            pr.setStatus(PrStatus.RFQ_SENT);
        }
        audit(pr, actorOr(req.actor(), pr.getRequestedBy()), "RFQ_SENT",
                sent + " vendor(s), round " + pr.getRound() + ", reply by " + deadline.toLocalDate());
        requests.save(pr);
        return detail(prId);
    }

    private List<Channel> channelsFor(Vendor v) {
        List<Channel> channels = new ArrayList<>();
        v.getContacts().stream().findFirst().ifPresent(c -> {
            if (c.getEmail() != null && !c.getEmail().isBlank()) channels.add(Channel.EMAIL);
            if (c.getWhatsapp() != null && !c.getWhatsapp().isBlank()) channels.add(Channel.WHATSAPP);
            else if (c.getPhone() != null && !c.getPhone().isBlank()) channels.add(Channel.SMS);
        });
        if (v.isPortalEnabled()) channels.add(Channel.PORTAL);
        return channels;
    }

    // ------------------------------------------------------------------ step 5: tracking & reminders

    public Rfq remind(String rfqId) {
        Rfq rfq = rfqs.findById(rfqId).orElseThrow(() -> ApiException.notFound("RFQ", rfqId));
        if (rfq.getStatus() == RfqStatus.REPLIED) throw ApiException.badRequest("Vendor has already replied");
        if (rfq.getStatus() == RfqStatus.NO_RESPONSE) throw ApiException.badRequest("RFQ already marked No Response");
        Vendor v = vendors.findById(rfq.getVendorId()).orElseThrow();
        rfq.setReminderCount(rfq.getReminderCount() + 1);
        rfq.setLastReminderAt(LocalDateTime.now());
        messaging.sendReminder(rfq, v);
        if (rfq.getReminderCount() >= maxReminders) {
            PurchaseRequest pr = get(rfq.getPurchaseRequestId());
            if (pr.getQuoteDeadline() != null && pr.getQuoteDeadline().isBefore(LocalDateTime.now())) {
                rfq.setStatus(RfqStatus.NO_RESPONSE);
            }
        }
        return rfqs.save(rfq);
    }

    /**
     * Auto-reminder sweep: for every un-replied RFQ older than the interval, send a reminder;
     * after the deadline with max reminders sent, mark No Response.
     */
    public int runReminderSweep(Duration interval) {
        int count = 0;
        for (Rfq rfq : rfqs.findAll()) {
            if (rfq.getStatus() == RfqStatus.REPLIED || rfq.getStatus() == RfqStatus.NO_RESPONSE) continue;
            PurchaseRequest pr = get(rfq.getPurchaseRequestId());
            if (rfq.getRound() != pr.getRound() || !isCollecting(pr)) continue;
            LocalDateTime last = rfq.getLastReminderAt() != null ? rfq.getLastReminderAt() : rfq.getSentAt();
            boolean pastDeadline = pr.getQuoteDeadline() != null && pr.getQuoteDeadline().isBefore(LocalDateTime.now());
            if (pastDeadline && rfq.getReminderCount() >= maxReminders) {
                rfq.setStatus(RfqStatus.NO_RESPONSE);
                rfqs.save(rfq);
            } else if (last.plus(interval).isBefore(LocalDateTime.now()) && rfq.getReminderCount() < maxReminders) {
                remind(rfq.getId());
                count++;
            }
        }
        return count;
    }

    /**
     * Demo helper: advances delivery/read receipts and makes some vendors reply with
     * realistic free-text quotes that go through the parser. Replaces real webhooks.
     */
    public PurchaseRequestDetail simulateVendorActivity(String prId) {
        PurchaseRequest pr = get(prId);
        if (!isCollecting(pr)) throw ApiException.badRequest("Request is not collecting quotes");
        for (Rfq rfq : rfqs.findByPurchaseRequest(prId)) {
            if (rfq.getRound() != pr.getRound()) continue;
            switch (rfq.getStatus()) {
                case SENT -> { rfq.setStatus(RfqStatus.DELIVERED); rfq.setDeliveredAt(LocalDateTime.now()); }
                case DELIVERED -> { rfq.setStatus(RfqStatus.READ); rfq.setReadAt(LocalDateTime.now()); }
                case READ -> {
                    if (random.nextDouble() < 0.75) {
                        String text = sampleReply(pr);
                        QuoteSource src = List.of(QuoteSource.WHATSAPP_TEXT, QuoteSource.EMAIL_TEXT, QuoteSource.PDF,
                                QuoteSource.IMAGE, QuoteSource.VOICE).get(random.nextInt(5));
                        recordRawReply(prId, new RawReplyRequest(rfq.getId(), src, text,
                                src == QuoteSource.PDF ? "quotation.pdf" : src == QuoteSource.IMAGE ? "quote_photo.jpg"
                                        : src == QuoteSource.VOICE ? "voice_note.ogg" : null));
                        continue;
                    }
                }
                default -> { }
            }
            rfqs.save(rfq);
        }
        return detail(prId);
    }

    private String sampleReply(PurchaseRequest pr) {
        int qty = pr.getTotalQuantity();
        int base = pr.getLines().isEmpty() ? 500 : 400 + random.nextInt(900);
        int gst = List.of(5, 12, 18).get(random.nextInt(3));
        int days = 3 + random.nextInt(12);
        int delivery = random.nextBoolean() ? 0 : 200 + random.nextInt(6) * 100;
        String deliveryText = delivery == 0 ? "Free delivery." : "Delivery charges Rs " + delivery + ".";
        return switch (random.nextInt(3)) {
            case 0 -> "Hello sir, for " + qty + " nos we can do Rs " + base + " per piece + GST " + gst
                    + "%. Supply within " + days + " days. " + deliveryText + " Valid for 30 days. 50% advance.";
            case 1 -> "Quotation: Rate " + base + "/- each, " + gst + "% GST extra. " + deliveryText
                    + " Lead time " + days + " working days. Payment Net 30. Quote validity 15 days.";
            default -> "Sir we will give rs." + base + " per unit. delivery in " + days + " days. " + deliveryText;
        };
    }

    // ------------------------------------------------------------------ step 6: parse / record quotes

    public Quote recordRawReply(String prId, RawReplyRequest req) {
        PurchaseRequest pr = get(prId);
        Rfq rfq = rfqFor(pr, req.rfqId());
        Quote q = parser.parse(req.rawText(), req.source(), pr.getTotalQuantity());
        q.setAttachmentName(req.attachmentName());
        return store(pr, rfq, q);
    }

    public Quote submitQuote(String prId, QuoteSubmission s, boolean viaPortal) {
        PurchaseRequest pr = get(prId);
        Rfq rfq = rfqFor(pr, s.rfqId());
        Quote q = new Quote();
        q.setUnitPrice(s.unitPrice());
        q.setQuantity(pr.getTotalQuantity());
        q.setTaxPercent(s.taxPercent() == null ? BigDecimal.ZERO : s.taxPercent());
        q.setDeliveryCharge(s.deliveryCharge() == null ? BigDecimal.ZERO : s.deliveryCharge());
        q.setDeliveryDays(s.deliveryDays());
        q.setValidityDays(s.validityDays());
        q.setPaymentTerms(s.paymentTerms());
        q.setRemarks(s.remarks());
        q.setMeetsSpecs(s.meetsSpecs() == null || s.meetsSpecs());
        q.setSpecDeviation(s.specDeviation());
        q.setSource(viaPortal ? QuoteSource.PORTAL : (s.source() == null ? QuoteSource.MANUAL : s.source()));
        q.setParseConfidence(1.0);
        q.setManuallyVerified(!viaPortal);
        return store(pr, rfq, q);
    }

    /** Manager corrects / confirms a low-confidence parsed quote. */
    public Quote verifyQuote(String prId, String quoteId, QuoteSubmission s) {
        PurchaseRequest pr = get(prId);
        Quote q = quotes.findById(quoteId).filter(x -> x.getPurchaseRequestId().equals(prId))
                .orElseThrow(() -> ApiException.notFound("Quote", quoteId));
        q.setUnitPrice(s.unitPrice());
        if (s.taxPercent() != null) q.setTaxPercent(s.taxPercent());
        if (s.deliveryCharge() != null) q.setDeliveryCharge(s.deliveryCharge());
        q.setDeliveryDays(s.deliveryDays());
        q.setValidityDays(s.validityDays());
        if (s.paymentTerms() != null) q.setPaymentTerms(s.paymentTerms());
        if (s.meetsSpecs() != null) q.setMeetsSpecs(s.meetsSpecs());
        q.setSpecDeviation(s.specDeviation());
        q.setManuallyVerified(true);
        q.getLowConfidenceFields().clear();
        audit(pr, pr.getRequestedBy(), "QUOTE_VERIFIED", q.getVendorName() + " - Rs " + q.getLandedCost());
        requests.save(pr);
        return quotes.save(q);
    }

    private Quote store(PurchaseRequest pr, Rfq rfq, Quote q) {
        if (!isCollecting(pr)) {
            throw ApiException.badRequest("Quotes are not being accepted; request is " + pr.getStatus());
        }
        List<Quote> previous = quotes.findByRfq(rfq.getId());
        q.setId(quotes.nextId());
        q.setRfqId(rfq.getId());
        q.setPurchaseRequestId(pr.getId());
        q.setRound(rfq.getRound());
        q.setVendorId(rfq.getVendorId());
        q.setVendorName(rfq.getVendorName());
        q.setVersion(previous.size() + 1);
        q.setReceivedAt(LocalDateTime.now());
        q.setLate(pr.getQuoteDeadline() != null && q.getReceivedAt().isAfter(pr.getQuoteDeadline()));
        quotes.save(q);

        if (rfq.getStatus() != RfqStatus.REPLIED) {
            if (rfq.getDeliveredAt() == null) rfq.setDeliveredAt(q.getReceivedAt());
            if (rfq.getReadAt() == null) rfq.setReadAt(q.getReceivedAt());
            rfq.setStatus(RfqStatus.REPLIED);
            rfq.setRepliedAt(q.getReceivedAt());
            vendors.findById(rfq.getVendorId()).ifPresent(v -> {
                var perf = v.getPerformance();
                double hours = Duration.between(rfq.getSentAt(), q.getReceivedAt()).toMinutes() / 60.0;
                perf.setAvgResponseHours(Math.round(((perf.getAvgResponseHours() * perf.getRfqsResponded()) + hours)
                        / (perf.getRfqsResponded() + 1) * 10) / 10.0);
                perf.setRfqsResponded(perf.getRfqsResponded() + 1);
            });
            rfqs.save(rfq);
        }
        if (pr.getStatus() == PrStatus.RFQ_SENT) pr.setStatus(PrStatus.COLLECTING_QUOTES);
        audit(pr, rfq.getVendorName(), q.getVersion() > 1 ? "QUOTE_REVISED" : "QUOTE_RECEIVED",
                "via " + q.getSource() + " - Rs " + q.getLandedCost()
                        + (q.isNeedsReview() ? " (needs review)" : "") + (q.isLate() ? " [LATE]" : ""));
        requests.save(pr);
        return q;
    }

    private Rfq rfqFor(PurchaseRequest pr, String rfqId) {
        Rfq rfq = rfqs.findById(rfqId).orElseThrow(() -> ApiException.notFound("RFQ", rfqId));
        if (!rfq.getPurchaseRequestId().equals(pr.getId())) throw ApiException.badRequest("RFQ does not belong to this request");
        if (rfq.getRound() != pr.getRound()) throw ApiException.badRequest("This RFQ belongs to an earlier round");
        return rfq;
    }

    private boolean isCollecting(PurchaseRequest pr) {
        return pr.getStatus() == PrStatus.RFQ_SENT || pr.getStatus() == PrStatus.COLLECTING_QUOTES;
    }

    // ------------------------------------------------------------------ step 7: close & compare

    public PurchaseRequestDetail closeQuotes(String prId, String actor) {
        PurchaseRequest pr = get(prId);
        if (!isCollecting(pr)) throw ApiException.badRequest("Request is not collecting quotes");
        Comparison c = compare(pr);
        if (c.quotesReceived() == 0) throw ApiException.badRequest("No quotes received yet");
        rfqs.findByPurchaseRequest(prId).stream()
                .filter(r -> r.getRound() == pr.getRound() && r.getStatus() != RfqStatus.REPLIED)
                .forEach(r -> { r.setStatus(RfqStatus.NO_RESPONSE); rfqs.save(r); });
        pr.setStatus(PrStatus.UNDER_REVIEW);
        audit(pr, actorOr(actor, pr.getRequestedBy()), "QUOTES_CLOSED",
                c.quotesReceived() + " quote(s); L1 Rs " + c.l1Amount()
                        + (c.meetsMinQuotes() ? "" : " - below minimum of " + minQuotes));
        requests.save(pr);
        return detail(prId);
    }

    // ------------------------------------------------------------------ step 8: manager review

    public PurchaseRequestDetail managerReview(String prId, ManagerReviewRequest req) {
        PurchaseRequest pr = get(prId);
        if (pr.getStatus() != PrStatus.UNDER_REVIEW && pr.getStatus() != PrStatus.SENT_BACK) {
            throw ApiException.badRequest("Manager review is not open; request is " + pr.getStatus());
        }
        String actor = actorOr(req.actor(), pr.getRequestedBy());
        Comparison c = compare(pr);
        switch (req.action().toUpperCase(Locale.ROOT)) {
            case "SELECT" -> {
                Quote q = c.rows().stream().map(ComparisonRow::quote)
                        .filter(x -> x.getId().equals(req.quoteId())).findFirst()
                        .orElseThrow(() -> ApiException.badRequest("Select a quote from the current comparison"));
                if (q.isNeedsReview()) throw ApiException.badRequest("Verify the parsed quote from " + q.getVendorName() + " first");
                boolean isL1 = q.getId().equals(c.l1QuoteId());
                if (!isL1 && blank(req.justification())) {
                    throw ApiException.badRequest("Justification is required when not selecting the lowest (L1) quote");
                }
                if (!c.meetsMinQuotes() && blank(req.justification())) {
                    throw ApiException.badRequest("Only " + c.quotesReceived() + " quote(s) received (minimum "
                            + minQuotes + "). Add a justification to proceed.");
                }
                pr.setSelectedQuoteId(q.getId());
                pr.setSelectedVendorId(q.getVendorId());
                pr.setSelectionJustification(req.justification());
                pr.getApprovals().add(new Approval(ApprovalLevel.MANAGER, actor, ApprovalDecision.APPROVED,
                        q.getVendorId(), req.justification(), LocalDateTime.now()));
                audit(pr, actor, "VENDOR_SELECTED", q.getVendorName() + " - Rs " + q.getLandedCost() + (isL1 ? " (L1)" : " (not L1)"));
                ApprovalPolicy policy = policyFor(pr, c);
                if (policy.requiresOfficial()) {
                    pr.setStatus(PrStatus.PENDING_APPROVAL);
                    requests.save(pr);
                } else {
                    pr.setStatus(PrStatus.APPROVED);
                    issuePurchaseOrder(pr, q, actor);
                }
            }
            case "REJECT_ALL" -> {
                if (blank(req.justification())) throw ApiException.badRequest("Give a reason for rejecting all quotes");
                pr.getApprovals().add(new Approval(ApprovalLevel.MANAGER, actor, ApprovalDecision.REJECTED_REQUOTE,
                        null, req.justification(), LocalDateTime.now()));
                pr.setStatus(PrStatus.REJECTED_REQUOTE);
                pr.setRound(pr.getRound() + 1);
                pr.setSelectedQuoteId(null);
                pr.setSelectedVendorId(null);
                audit(pr, actor, "REJECTED_REQUOTE", req.justification() + " - starting round " + pr.getRound());
                requests.save(pr);
            }
            default -> throw ApiException.badRequest("Unknown action " + req.action());
        }
        return detail(prId);
    }

    // ------------------------------------------------------------------ step 9: higher official

    public PurchaseRequestDetail officialDecision(String prId, OfficialDecisionRequest req) {
        PurchaseRequest pr = get(prId);
        if (pr.getStatus() != PrStatus.PENDING_APPROVAL) {
            throw ApiException.badRequest("Nothing pending approval; request is " + pr.getStatus());
        }
        String actor = actorOr(req.actor(), "Principal");
        switch (req.action().toUpperCase(Locale.ROOT)) {
            case "APPROVE" -> {
                pr.getApprovals().add(new Approval(ApprovalLevel.OFFICIAL, actor, ApprovalDecision.APPROVED,
                        pr.getSelectedVendorId(), req.comments(), LocalDateTime.now()));
                pr.setStatus(PrStatus.APPROVED);
                audit(pr, actor, "APPROVED", blank(req.comments()) ? "Second-level sign-off" : req.comments());
                Quote q = quotes.findById(pr.getSelectedQuoteId()).orElseThrow();
                issuePurchaseOrder(pr, q, actor);
            }
            case "SEND_BACK" -> {
                if (blank(req.comments())) throw ApiException.badRequest("Comments are required when sending back");
                pr.getApprovals().add(new Approval(ApprovalLevel.OFFICIAL, actor, ApprovalDecision.SENT_BACK,
                        pr.getSelectedVendorId(), req.comments(), LocalDateTime.now()));
                pr.setStatus(PrStatus.SENT_BACK);
                audit(pr, actor, "SENT_BACK", req.comments());
                requests.save(pr);
            }
            case "REJECT" -> {
                if (blank(req.comments())) throw ApiException.badRequest("A reason is required to reject");
                pr.getApprovals().add(new Approval(ApprovalLevel.OFFICIAL, actor, ApprovalDecision.REJECTED,
                        pr.getSelectedVendorId(), req.comments(), LocalDateTime.now()));
                pr.setStatus(PrStatus.CANCELLED);
                audit(pr, actor, "CANCELLED", req.comments());
                requests.save(pr);
            }
            default -> throw ApiException.badRequest("Unknown action " + req.action());
        }
        return detail(prId);
    }

    public PurchaseRequestDetail cancel(String prId, String actor, String reason) {
        PurchaseRequest pr = get(prId);
        if (pr.getStatus() == PrStatus.PO_ISSUED || pr.getStatus() == PrStatus.CANCELLED) {
            throw ApiException.badRequest("Request is already " + pr.getStatus());
        }
        pr.setStatus(PrStatus.CANCELLED);
        audit(pr, actorOr(actor, pr.getRequestedBy()), "CANCELLED", blank(reason) ? "Cancelled by requester" : reason);
        requests.save(pr);
        return detail(prId);
    }

    // ------------------------------------------------------------------ step 10: PO

    private void issuePurchaseOrder(PurchaseRequest pr, Quote q, String actor) {
        Vendor winner = vendors.findById(q.getVendorId()).orElseThrow();
        PurchaseOrder po = new PurchaseOrder();
        po.setId(orders.nextId());
        po.setNumber("PO-" + Year.now() + "-" + String.format("%04d", orders.count() + 1));
        po.setPurchaseRequestId(pr.getId());
        po.setPurchaseRequestNumber(pr.getNumber());
        po.setTitle(pr.getTitle());
        po.setVendorId(winner.getId());
        po.setVendorName(winner.getDisplayName());
        po.setQuoteId(q.getId());
        po.setAmount(q.getLandedCost());
        po.setPaymentTerms(q.getPaymentTerms() != null ? q.getPaymentTerms() : winner.getPaymentTerms());
        po.setExpectedDelivery(LocalDateTime.now().toLocalDate().plusDays(q.getDeliveryDays()));
        po.setStatus(PoStatus.ISSUED);
        po.setIssuedAt(LocalDateTime.now());
        PrLine line = pr.getLines().get(0);
        po.setItemId(line.getItemId());
        po.setCategoryId(pr.getCategoryId());
        po.setDescription(line.getDescription());
        po.setUnit(line.getUnit());
        po.setOrderedQuantity(q.getQuantity());
        po.setUnitCost(q.getLandedCost().divide(BigDecimal.valueOf(Math.max(1, q.getQuantity())), 2, RoundingMode.HALF_UP));
        orders.save(po);

        pr.setPurchaseOrderId(po.getId());
        pr.setStatus(PrStatus.PO_ISSUED);
        audit(pr, actor, "PO_ISSUED", po.getNumber() + " to " + winner.getDisplayName() + " - Rs " + po.getAmount());
        requests.save(pr);

        winner.getPerformance().setQuotesWon(winner.getPerformance().getQuotesWon() + 1);
        messaging.sendPurchaseOrder(po, winner);
        latestQuotesForRound(pr).stream()
                .map(Quote::getVendorId).distinct()
                .filter(id -> !id.equals(winner.getId()))
                .forEach(id -> vendors.findById(id).ifPresent(v -> messaging.sendNotSelected(pr, v)));
    }

    public PurchaseOrder updatePoStatus(String poId, PoStatus status, String vendorId) {
        PurchaseOrder po = orders.findById(poId).orElseThrow(() -> ApiException.notFound("Purchase order", poId));
        if (vendorId != null && !po.getVendorId().equals(vendorId)) throw ApiException.notFound("Purchase order", poId);
        boolean allowed = switch (status) {
            case ACCEPTED -> po.getStatus() == PoStatus.ISSUED;
            case DISPATCHED -> po.getStatus() == PoStatus.ISSUED || po.getStatus() == PoStatus.ACCEPTED
                    || po.getStatus() == PoStatus.PARTIALLY_RECEIVED;
            default -> false;
        };
        if (!allowed) throw ApiException.badRequest("Cannot mark " + po.getNumber() + " as " + status + " while it is " + po.getStatus());
        po.setStatus(status);
        return orders.save(po);
    }

    // ------------------------------------------------------------------ vendor portal

    public List<Map<String, Object>> portalRfqs(String vendorId) {
        return rfqs.findByVendor(vendorId).stream()
                .sorted(Comparator.comparing(Rfq::getSentAt).reversed())
                .map(r -> {
                    PurchaseRequest pr = get(r.getPurchaseRequestId());
                    Quote latest = quotes.findByRfq(r.getId()).stream()
                            .max(Comparator.comparingInt(Quote::getVersion)).orElse(null);
                    boolean open = r.getRound() == pr.getRound() && isCollecting(pr) && r.getStatus() != RfqStatus.NO_RESPONSE;
                    // Sealed bid: vendor sees only the request and its own quote.
                    Map<String, Object> m = new java.util.LinkedHashMap<>();
                    m.put("rfq", r);
                    m.put("purchaseRequestId", pr.getId());
                    m.put("title", pr.getTitle());
                    m.put("lines", pr.getLines());
                    m.put("dueDate", pr.getDueDate());
                    m.put("deliveryLocation", pr.getDeliveryLocation());
                    m.put("quoteDeadline", pr.getQuoteDeadline());
                    m.put("open", open);
                    m.put("myQuote", latest);
                    m.put("outcome", outcomeFor(pr, vendorId, r));
                    return m;
                })
                .toList();
    }

    private String outcomeFor(PurchaseRequest pr, String vendorId, Rfq r) {
        if (r.getRound() != pr.getRound()) return "CLOSED";
        if (pr.getStatus() == PrStatus.PO_ISSUED) return vendorId.equals(pr.getSelectedVendorId()) ? "WON" : "NOT_SELECTED";
        if (pr.getStatus() == PrStatus.CANCELLED) return "CANCELLED";
        if (isCollecting(pr)) return "OPEN";
        return "UNDER_EVALUATION";
    }

    /** Vendor opened the RFQ on the portal: counts as delivered + read. */
    public void portalMarkRead(String vendorId, String rfqId) {
        Rfq rfq = rfqs.findById(rfqId).filter(r -> r.getVendorId().equals(vendorId))
                .orElseThrow(() -> ApiException.notFound("RFQ", rfqId));
        if (rfq.getStatus() == RfqStatus.SENT || rfq.getStatus() == RfqStatus.DELIVERED) {
            if (rfq.getDeliveredAt() == null) rfq.setDeliveredAt(LocalDateTime.now());
            rfq.setReadAt(LocalDateTime.now());
            rfq.setStatus(RfqStatus.READ);
            rfqs.save(rfq);
        }
    }

    public Quote portalSubmit(String vendorId, String rfqId, QuoteSubmission s) {
        Rfq rfq = rfqs.findById(rfqId).filter(r -> r.getVendorId().equals(vendorId))
                .orElseThrow(() -> ApiException.notFound("RFQ", rfqId));
        return submitQuote(rfq.getPurchaseRequestId(), s, true);
    }

    // ------------------------------------------------------------------ dashboard helpers

    public Map<PrStatus, Long> countsByStatus() {
        return requests.findAll().stream().collect(Collectors.groupingBy(PurchaseRequest::getStatus, Collectors.counting()));
    }

    public List<Quote> latestQuotesForRound(PurchaseRequest pr) {
        return quotes.findByPurchaseRequest(pr.getId()).stream()
                .filter(q -> q.getRound() == pr.getRound())
                .collect(Collectors.toMap(Quote::getVendorId, Function.identity(),
                        (a, b) -> a.getVersion() >= b.getVersion() ? a : b))
                .values().stream().toList();
    }

    private static void audit(PurchaseRequest pr, String actor, String action, String details) {
        pr.getAudit().add(0, AuditEntry.of(actor, action, details));
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
