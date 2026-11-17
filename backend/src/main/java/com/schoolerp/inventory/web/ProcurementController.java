package com.schoolerp.inventory.web;

import com.schoolerp.inventory.model.Item;
import com.schoolerp.inventory.model.PurchaseOrder;
import com.schoolerp.inventory.model.PurchaseRequest;
import com.schoolerp.inventory.model.Quote;
import com.schoolerp.inventory.model.Rfq;
import com.schoolerp.inventory.model.Vendor;
import com.schoolerp.inventory.repository.Repositories.ItemRepository;
import com.schoolerp.inventory.service.DashboardService;
import com.schoolerp.inventory.service.ProcurementService;
import com.schoolerp.inventory.web.dto.Dtos.ActorRequest;
import com.schoolerp.inventory.web.dto.Dtos.ManagerReviewRequest;
import com.schoolerp.inventory.web.dto.Dtos.OfficialDecisionRequest;
import com.schoolerp.inventory.web.dto.Dtos.PurchaseRequestCreate;
import com.schoolerp.inventory.web.dto.Dtos.PurchaseRequestDetail;
import com.schoolerp.inventory.web.dto.Dtos.QuoteSubmission;
import com.schoolerp.inventory.web.dto.Dtos.RawReplyRequest;
import com.schoolerp.inventory.web.dto.Dtos.SendRfqRequest;
import jakarta.validation.Valid;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
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
public class ProcurementController {

    private final ProcurementService procurement;
    private final DashboardService dashboard;
    private final ItemRepository items;

    public ProcurementController(ProcurementService procurement, DashboardService dashboard, ItemRepository items) {
        this.procurement = procurement;
        this.dashboard = dashboard;
        this.items = items;
    }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard() {
        return dashboard.summary();
    }

    @GetMapping("/items")
    public List<Item> items(@RequestParam(required = false) String category) {
        return items.findAll().stream()
                .filter(i -> category == null || category.equals(i.getCategoryId()))
                .sorted(Comparator.comparing(Item::getName))
                .toList();
    }

    @GetMapping("/purchase-requests")
    public List<PurchaseRequest> list(@RequestParam(required = false) String status) {
        return procurement.list(status);
    }

    @PostMapping("/purchase-requests")
    @ResponseStatus(HttpStatus.CREATED)
    public PurchaseRequest create(@Valid @RequestBody PurchaseRequestCreate req) {
        return procurement.create(req);
    }

    @GetMapping("/purchase-requests/{id}")
    public PurchaseRequestDetail detail(@PathVariable String id) {
        return procurement.detail(id);
    }

    @GetMapping("/purchase-requests/{id}/suggested-vendors")
    public List<Vendor> suggestedVendors(@PathVariable String id) {
        return procurement.suggestedVendors(id);
    }

    @PostMapping("/purchase-requests/{id}/rfqs")
    public PurchaseRequestDetail sendRfq(@PathVariable String id, @Valid @RequestBody SendRfqRequest req) {
        return procurement.sendRfq(id, req);
    }

    @PostMapping("/rfqs/{rfqId}/remind")
    public Rfq remind(@PathVariable String rfqId) {
        return procurement.remind(rfqId);
    }

    @PostMapping("/purchase-requests/{id}/simulate")
    public PurchaseRequestDetail simulate(@PathVariable String id) {
        return procurement.simulateVendorActivity(id);
    }

    @PostMapping("/purchase-requests/{id}/quotes")
    public Quote manualQuote(@PathVariable String id, @Valid @RequestBody QuoteSubmission req) {
        return procurement.submitQuote(id, req, false);
    }

    @PostMapping("/purchase-requests/{id}/replies")
    public Quote rawReply(@PathVariable String id, @Valid @RequestBody RawReplyRequest req) {
        return procurement.recordRawReply(id, req);
    }

    @PutMapping("/purchase-requests/{id}/quotes/{quoteId}")
    public Quote verifyQuote(@PathVariable String id, @PathVariable String quoteId,
                             @Valid @RequestBody QuoteSubmission req) {
        return procurement.verifyQuote(id, quoteId, req);
    }

    @PostMapping("/purchase-requests/{id}/close-quotes")
    public PurchaseRequestDetail closeQuotes(@PathVariable String id, @RequestBody(required = false) ActorRequest req) {
        return procurement.closeQuotes(id, req == null ? null : req.actor());
    }

    @PostMapping("/purchase-requests/{id}/review")
    public PurchaseRequestDetail review(@PathVariable String id, @Valid @RequestBody ManagerReviewRequest req) {
        return procurement.managerReview(id, req);
    }

    @PostMapping("/purchase-requests/{id}/approval")
    public PurchaseRequestDetail approval(@PathVariable String id, @Valid @RequestBody OfficialDecisionRequest req) {
        return procurement.officialDecision(id, req);
    }

    @PostMapping("/purchase-requests/{id}/cancel")
    public PurchaseRequestDetail cancel(@PathVariable String id, @RequestBody(required = false) ActorRequest req) {
        return procurement.cancel(id, req == null ? null : req.actor(), req == null ? null : req.reason());
    }

    @GetMapping("/purchase-orders")
    public List<PurchaseOrder> purchaseOrders(@RequestParam(required = false) String vendorId) {
        return procurement.purchaseOrders(vendorId);
    }
}
