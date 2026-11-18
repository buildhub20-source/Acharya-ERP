package com.schoolerp.inventory.web;

import com.schoolerp.inventory.model.Category;
import com.schoolerp.inventory.model.Vendor;
import com.schoolerp.inventory.service.MessagingService;
import com.schoolerp.inventory.service.VendorService;
import com.schoolerp.inventory.web.dto.Dtos.ActorRequest;
import com.schoolerp.inventory.web.dto.Dtos.DocumentRequest;
import com.schoolerp.inventory.model.MessageLog;
import com.schoolerp.inventory.web.dto.Dtos.RatingRequest;
import com.schoolerp.inventory.web.dto.Dtos.VendorRequest;
import com.schoolerp.inventory.web.dto.Dtos.VendorStatusChange;
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
public class VendorController {

    private final VendorService vendors;
    private final MessagingService messaging;

    public VendorController(VendorService vendors, MessagingService messaging) {
        this.vendors = vendors;
        this.messaging = messaging;
    }

    @GetMapping("/categories")
    public List<Category> categories() {
        return vendors.categories();
    }

    @GetMapping("/vendors")
    public List<Vendor> list(@RequestParam(required = false) String category,
                             @RequestParam(required = false) String status,
                             @RequestParam(required = false) String q,
                             @RequestParam(defaultValue = "false") boolean eligibleOnly) {
        return vendors.list(category, status, q, eligibleOnly);
    }

    @GetMapping("/vendors/{id}")
    public Vendor get(@PathVariable String id) {
        return vendors.get(id);
    }

    @PostMapping("/vendors")
    @ResponseStatus(HttpStatus.CREATED)
    public Vendor create(@Valid @RequestBody VendorRequest req) {
        return vendors.create(req);
    }

    @PutMapping("/vendors/{id}")
    public Vendor update(@PathVariable String id, @Valid @RequestBody VendorRequest req) {
        return vendors.update(id, req);
    }

    @PostMapping("/vendors/{id}/status")
    public Vendor changeStatus(@PathVariable String id, @Valid @RequestBody VendorStatusChange req) {
        return vendors.changeStatus(id, req);
    }

    @PostMapping("/vendors/{id}/bank-change/approve")
    public Vendor approveBank(@PathVariable String id, @RequestBody(required = false) ActorRequest req) {
        return vendors.decideBankChange(id, true, req == null ? null : req.actor());
    }

    @PostMapping("/vendors/{id}/bank-change/reject")
    public Vendor rejectBank(@PathVariable String id, @RequestBody(required = false) ActorRequest req) {
        return vendors.decideBankChange(id, false, req == null ? null : req.actor());
    }

    @PostMapping("/vendors/{id}/documents")
    public Vendor addDocument(@PathVariable String id, @Valid @RequestBody DocumentRequest req) {
        return vendors.addDocument(id, req);
    }

    @PostMapping("/vendors/{id}/documents/{docId}/verify")
    public Vendor verifyDocument(@PathVariable String id, @PathVariable String docId,
                                 @RequestParam(defaultValue = "true") boolean ok,
                                 @RequestBody(required = false) ActorRequest req) {
        return vendors.verifyDocument(id, docId, ok, req == null ? null : req.actor());
    }

    @PostMapping("/vendors/{id}/rating")
    public Vendor rate(@PathVariable String id, @Valid @RequestBody RatingRequest req) {
        return vendors.rate(id, req.rating(), req.actor());
    }

    @GetMapping("/vendors/expiring-documents")
    public List<VendorService.ExpiringDoc> expiring(@RequestParam(defaultValue = "30") int days) {
        return vendors.expiringDocuments(days);
    }

    /** Mock outbox: every email / WhatsApp / SMS the system "sent". */
    @GetMapping("/outbox")
    public List<MessageLog> outbox(@RequestParam(required = false) String vendorId,
                                      @RequestParam(defaultValue = "50") int limit) {
        return messaging.outbox(vendorId, limit);
    }
}
