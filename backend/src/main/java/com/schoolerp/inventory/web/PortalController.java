package com.schoolerp.inventory.web;

import com.schoolerp.inventory.model.Enums.PoStatus;
import com.schoolerp.inventory.model.PurchaseOrder;
import com.schoolerp.inventory.model.Quote;
import com.schoolerp.inventory.model.Vendor;
import com.schoolerp.inventory.service.MessagingService;
import com.schoolerp.inventory.service.ProcurementService;
import com.schoolerp.inventory.service.VendorService;
import com.schoolerp.inventory.web.dto.Dtos.DocumentRequest;
import com.schoolerp.inventory.web.dto.Dtos.OutboxMessage;
import com.schoolerp.inventory.web.dto.Dtos.QuoteSubmission;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Vendor self-service portal. Auth is mocked: the vendor id in the path stands in
 * for the logged-in vendor. Replace with Supabase Auth (JWT) later and derive the
 * vendor from the token instead.
 */
@RestController
@RequestMapping("/api/portal/vendors/{vendorId}")
public class PortalController {

    private final VendorService vendors;
    private final ProcurementService procurement;
    private final MessagingService messaging;

    public PortalController(VendorService vendors, ProcurementService procurement, MessagingService messaging) {
        this.vendors = vendors;
        this.procurement = procurement;
        this.messaging = messaging;
    }

    @GetMapping
    public Vendor profile(@PathVariable String vendorId) {
        return vendors.get(vendorId);
    }

    @GetMapping("/rfqs")
    public List<Map<String, Object>> rfqs(@PathVariable String vendorId) {
        vendors.get(vendorId);
        return procurement.portalRfqs(vendorId);
    }

    @PostMapping("/rfqs/{rfqId}/read")
    public void markRead(@PathVariable String vendorId, @PathVariable String rfqId) {
        procurement.portalMarkRead(vendorId, rfqId);
    }

    @PostMapping("/rfqs/{rfqId}/quote")
    public Quote submitQuote(@PathVariable String vendorId, @PathVariable String rfqId,
                             @Valid @RequestBody QuoteSubmission req) {
        if (!rfqId.equals(req.rfqId())) throw ApiException.badRequest("RFQ id mismatch");
        return procurement.portalSubmit(vendorId, rfqId, req);
    }

    @GetMapping("/orders")
    public List<PurchaseOrder> orders(@PathVariable String vendorId) {
        return procurement.purchaseOrders(vendorId);
    }

    @PostMapping("/orders/{poId}/{action}")
    public PurchaseOrder updateOrder(@PathVariable String vendorId, @PathVariable String poId,
                                     @PathVariable String action) {
        PoStatus status = switch (action) {
            case "accept" -> PoStatus.ACCEPTED;
            case "dispatch" -> PoStatus.DISPATCHED;
            default -> throw ApiException.badRequest("Unknown action " + action);
        };
        return procurement.updatePoStatus(poId, status, vendorId);
    }

    @PostMapping("/documents")
    public Vendor uploadDocument(@PathVariable String vendorId, @Valid @RequestBody DocumentRequest req) {
        return vendors.addDocument(vendorId, req);
    }

    @GetMapping("/messages")
    public List<OutboxMessage> messages(@PathVariable String vendorId) {
        return messaging.outbox(vendorId, 30);
    }
}
