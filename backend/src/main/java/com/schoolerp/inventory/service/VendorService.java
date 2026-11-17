package com.schoolerp.inventory.service;

import com.schoolerp.inventory.model.AuditEntry;
import com.schoolerp.inventory.model.BankDetails;
import com.schoolerp.inventory.model.Category;
import com.schoolerp.inventory.model.ContactPerson;
import com.schoolerp.inventory.model.IdentityChange;
import com.schoolerp.inventory.model.Item;
import com.schoolerp.inventory.model.VendorItem;
import com.schoolerp.inventory.web.dto.VendorDtos.CatalogueEntry;
import com.schoolerp.inventory.web.dto.VendorDtos.CategoryRequest;
import com.schoolerp.inventory.web.dto.VendorDtos.IdentityChangeRequest;
import com.schoolerp.inventory.web.dto.VendorDtos.InviteLink;
import com.schoolerp.inventory.web.dto.VendorDtos.Supplier;
import java.time.LocalDate;
import com.schoolerp.inventory.model.Enums.DocVerification;
import com.schoolerp.inventory.model.Enums.VendorStatus;
import com.schoolerp.inventory.model.Vendor;
import com.schoolerp.inventory.model.VendorDocument;
import com.schoolerp.inventory.repository.Repositories.CategoryRepository;
import com.schoolerp.inventory.repository.Repositories.ItemRepository;
import com.schoolerp.inventory.repository.Repositories.VendorRepository;
import com.schoolerp.inventory.web.ApiException;
import com.schoolerp.inventory.web.dto.Dtos.BankInput;
import com.schoolerp.inventory.web.dto.Dtos.DocumentRequest;
import com.schoolerp.inventory.web.dto.Dtos.VendorRequest;
import com.schoolerp.inventory.web.dto.Dtos.VendorStatusChange;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class VendorService {

    /** Documents whose expiry suspends a vendor automatically. */
    private static final Set<String> BLOCKING_DOCS = Set.of("GST_CERT", "TRADE_LICENCE", "FSSAI");

    private final VendorRepository vendors;
    private final CategoryRepository categories;
    private final MessagingService messaging;
    private final ItemRepository items;

    @Value("${app.frontend-url:http://localhost:3000}")
    private String frontendUrl;

    public VendorService(VendorRepository vendors, CategoryRepository categories, MessagingService messaging,
                         ItemRepository items) {
        this.vendors = vendors;
        this.categories = categories;
        this.messaging = messaging;
        this.items = items;
    }

    public List<Category> categories() {
        return categories.findAll().stream().sorted(Comparator.comparing(Category::getName)).toList();
    }

    public List<Vendor> list(String categoryId, String status, String q, boolean rfqEligibleOnly) {
        refreshCompliance();
        String query = q == null ? "" : q.toLowerCase(Locale.ROOT).trim();
        return vendors.findAll().stream()
                .filter(v -> categoryId == null || categoryId.isBlank() || v.getCategoryIds().contains(categoryId))
                .filter(v -> status == null || status.isBlank() || v.getStatus().name().equalsIgnoreCase(status))
                .filter(v -> !rfqEligibleOnly || v.isRfqEligible())
                .filter(v -> query.isEmpty()
                        || v.getLegalName().toLowerCase(Locale.ROOT).contains(query)
                        || (v.getTradeName() != null && v.getTradeName().toLowerCase(Locale.ROOT).contains(query))
                        || v.getCode().toLowerCase(Locale.ROOT).contains(query)
                        || (v.getCity() != null && v.getCity().toLowerCase(Locale.ROOT).contains(query)))
                .sorted(Comparator.comparingDouble((Vendor v) -> v.getPerformance().getOverallScore()).reversed())
                .toList();
    }

    public Vendor get(String id) {
        refreshCompliance();
        return vendors.findById(id).orElseThrow(() -> ApiException.notFound("Vendor", id));
    }

    public Vendor create(VendorRequest req) {
        validateCategories(req.categoryIds());
        if (vendors.existsByGstin(req.gstin(), null)) {
            throw ApiException.conflict("A vendor with GSTIN " + req.gstin() + " already exists");
        }
        Vendor v = new Vendor();
        v.setId(vendors.nextId());
        v.setCode("VND-" + String.format("%04d", vendors.count() + 1));
        v.setCreatedAt(LocalDateTime.now());
        apply(v, req, true);
        v.setStatus(req.inviteOnly() ? VendorStatus.INVITED : VendorStatus.PENDING_VERIFICATION);
        audit(v, req.actor(), req.inviteOnly() ? "INVITED" : "REGISTERED",
                req.inviteOnly() ? "Portal invite sent" : "Submitted for verification");
        vendors.save(v);
        if (req.inviteOnly()) sendInvite(v.getId());
        return v;
    }

    /**
     * Updates a vendor. Ordinary fields apply immediately; a change of bank details
     * or legal identity on an approved vendor is parked for approver sign-off.
     */
    public Vendor update(String id, VendorRequest req) {
        Vendor v = get(id);
        validateCategories(req.categoryIds());
        if (vendors.existsByGstin(req.gstin(), id)) {
            throw ApiException.conflict("A vendor with GSTIN " + req.gstin() + " already exists");
        }
        boolean approved = v.getStatus() == VendorStatus.ACTIVE || v.getStatus() == VendorStatus.SUSPENDED;
        boolean identityChanged = !Objects.equals(nz(v.getGstin()), nz(req.gstin()))
                || !Objects.equals(v.getLegalName(), req.legalName());
        if (approved && identityChanged) {
            throw ApiException.badRequest(
                    "Legal name / GSTIN / PAN of an approved vendor cannot be edited directly. Use 'Request legal change' so it is re-verified.");
        }
        BankDetails proposed = toBank(req.bank());
        boolean bankChanged = proposed != null && v.getBank() != null && bankDiffers(v.getBank(), proposed);
        apply(v, req, !approved);
        if (approved && bankChanged) {
            v.setPendingBankChange(proposed);
            audit(v, req.actor(), "BANK_CHANGE_REQUESTED", "New account " + proposed.getMaskedAccountNumber()
                    + " awaiting approval; payments on hold");
        } else if (proposed != null && (v.getBank() == null || !approved)) {
            v.setBank(proposed);
        }
        audit(v, req.actor(), "UPDATED", "Profile updated");
        return vendors.save(v);
    }

    public Vendor changeStatus(String id, VendorStatusChange change) {
        Vendor v = get(id);
        String actor = actorOr(change.actor(), "Procurement Admin");
        String reason = change.reason();
        VendorStatus from = v.getStatus();
        VendorStatus to;
        switch (change.action().toUpperCase(Locale.ROOT)) {
            case "APPROVE" -> {
                requireIn(from, "approve", VendorStatus.PENDING_VERIFICATION);
                if (v.getContacts().stream().noneMatch(c -> c.isPhoneVerified() || c.isEmailVerified())) {
                    throw ApiException.badRequest("At least one verified contact channel is required before approval");
                }
                v.getDocuments().forEach(d -> {
                    if (d.getVerification() == DocVerification.PENDING) d.setVerification(DocVerification.VERIFIED);
                });
                if (v.getBank() != null) v.getBank().setVerified(true);
                to = VendorStatus.ACTIVE;
                messaging.notifyVendor(v, "Vendor registration approved",
                        "Your vendor profile is approved. You will now receive RFQs for your categories.");
            }
            case "REJECT" -> {
                requireIn(from, "reject", VendorStatus.PENDING_VERIFICATION, VendorStatus.REGISTERED);
                requireReason(reason);
                to = VendorStatus.REJECTED;
            }
            case "SEND_BACK" -> {
                requireIn(from, "send back", VendorStatus.PENDING_VERIFICATION);
                requireReason(reason);
                to = VendorStatus.SENT_BACK;
                messaging.notifyVendor(v, "Changes needed on your vendor profile",
                        reason + "\n\nUpdate your profile and resubmit here: " + onboardingLink(ensureToken(v)));
            }
            case "SUBMIT" -> {
                requireIn(from, "submit", VendorStatus.INVITED, VendorStatus.REGISTERED, VendorStatus.SENT_BACK);
                to = VendorStatus.PENDING_VERIFICATION;
            }
            case "SUSPEND" -> {
                requireIn(from, "suspend", VendorStatus.ACTIVE);
                requireReason(reason);
                to = VendorStatus.SUSPENDED;
            }
            case "REACTIVATE" -> {
                requireIn(from, "reactivate", VendorStatus.SUSPENDED, VendorStatus.INACTIVE);
                VendorDocument expired = firstExpiredBlockingDoc(v);
                if (expired != null) {
                    throw ApiException.badRequest(expired.getType() + " is expired; renew it before reactivating");
                }
                to = VendorStatus.ACTIVE;
            }
            case "BLACKLIST" -> {
                requireReason(reason);
                to = VendorStatus.BLACKLISTED;
            }
            case "DEACTIVATE" -> {
                requireIn(from, "deactivate", VendorStatus.ACTIVE);
                to = VendorStatus.INACTIVE;
            }
            default -> throw ApiException.badRequest("Unknown action " + change.action());
        }
        v.setStatus(to);
        v.setStatusReason(reason);
        audit(v, actor, change.action().toUpperCase(Locale.ROOT),
                from + " → " + to + (reason == null || reason.isBlank() ? "" : " (" + reason + ")"));
        return vendors.save(v);
    }

    public Vendor decideBankChange(String id, boolean approve, String actor) {
        Vendor v = get(id);
        if (v.getPendingBankChange() == null) throw ApiException.badRequest("No pending bank change");
        if (approve) {
            BankDetails b = v.getPendingBankChange();
            b.setVerified(true);
            v.setBank(b);
            audit(v, actorOr(actor, "Bursar"), "BANK_CHANGE_APPROVED", "Account now " + b.getMaskedAccountNumber());
        } else {
            audit(v, actorOr(actor, "Bursar"), "BANK_CHANGE_REJECTED", "Kept " + v.getBank().getMaskedAccountNumber());
        }
        v.setPendingBankChange(null);
        return vendors.save(v);
    }

    public Vendor addDocument(String id, DocumentRequest req) {
        Vendor v = get(id);
        v.getDocuments().removeIf(d -> d.getType().equalsIgnoreCase(req.type()));
        v.getDocuments().add(new VendorDocument(UUID.randomUUID().toString(), req.type().toUpperCase(Locale.ROOT),
                req.number(), req.issueDate(), req.expiryDate(), DocVerification.PENDING,
                req.fileName() == null ? req.type().toLowerCase(Locale.ROOT) + ".pdf" : req.fileName()));
        audit(v, "Vendor", "DOCUMENT_UPLOADED", req.type() + (req.expiryDate() == null ? "" : " valid till " + req.expiryDate()));
        return vendors.save(v);
    }

    public Vendor verifyDocument(String id, String docId, boolean ok, String actor) {
        Vendor v = get(id);
        VendorDocument d = v.getDocuments().stream().filter(x -> x.getId().equals(docId)).findFirst()
                .orElseThrow(() -> ApiException.notFound("Document", docId));
        d.setVerification(ok ? DocVerification.VERIFIED : DocVerification.REJECTED);
        audit(v, actorOr(actor, "Procurement Admin"), ok ? "DOCUMENT_VERIFIED" : "DOCUMENT_REJECTED", d.getType());
        return vendors.save(v);
    }

    public Vendor rate(String id, double rating, String actor) {
        if (rating < 1 || rating > 5) throw ApiException.badRequest("Rating must be between 1 and 5");
        Vendor v = get(id);
        double old = v.getPerformance().getManualRating();
        double updated = old == 0 ? rating : Math.round((old * 0.7 + rating * 0.3) * 10) / 10.0;
        v.getPerformance().setManualRating(updated);
        audit(v, actorOr(actor, "Store Manager"), "RATED", rating + "★ (avg now " + updated + ")");
        return vendors.save(v);
    }

    /** Suspends active vendors whose blocking documents have expired (UC-5). */
    public void refreshCompliance() {
        for (Vendor v : vendors.findAll()) {
            if (v.getStatus() != VendorStatus.ACTIVE) continue;
            VendorDocument expired = firstExpiredBlockingDoc(v);
            if (expired != null) {
                v.setStatus(VendorStatus.SUSPENDED);
                v.setStatusReason(expired.getType() + " expired on " + expired.getExpiryDate());
                audit(v, "System", "AUTO_SUSPENDED", v.getStatusReason());
                messaging.notifyVendor(v, "Account suspended: document expired",
                        "Your " + expired.getType() + " expired on " + expired.getExpiryDate()
                                + ". Upload a renewed copy on the portal to continue receiving RFQs.");
                vendors.save(v);
            }
        }
    }

    public List<ExpiringDoc> expiringDocuments(int withinDays) {
        return vendors.findAll().stream()
                .flatMap(v -> v.getDocuments().stream()
                        .filter(d -> d.getDaysToExpiry() != null && d.getDaysToExpiry() <= withinDays)
                        .map(d -> new ExpiringDoc(v.getId(), v.getDisplayName(), d.getType(), d.getExpiryDate().toString(),
                                d.getDaysToExpiry())))
                .sorted(Comparator.comparingLong(ExpiringDoc::daysToExpiry))
                .toList();
    }

    // ---------- onboarding invites ----------

    /** (Re)sends the onboarding link. Only while the vendor is still completing its profile. */
    public InviteLink sendInvite(String id) {
        Vendor v = get(id);
        if (!v.isOnboardingOpen()) {
            throw ApiException.badRequest(v.getDisplayName() + " is " + v.getStatus() + "; onboarding links are only for vendors still registering");
        }
        String link = onboardingLink(ensureToken(v));
        v.setInviteSentAt(LocalDateTime.now());
        audit(v, "System", "INVITE_SENT", "Onboarding link sent");
        vendors.save(v);
        messaging.sendPortalInvite(v, link);
        ContactPerson c = v.getContacts().isEmpty() ? null : v.getContacts().get(0);
        return new InviteLink(link, c == null ? "-" : c.getEmail() + " / " + c.getWhatsapp());
    }

    String ensureToken(Vendor v) {
        if (v.getOnboardingToken() == null) {
            v.setOnboardingToken(UUID.randomUUID().toString().replace("-", ""));
            vendors.save(v);
        }
        return v.getOnboardingToken();
    }

    String onboardingLink(String token) {
        return frontendUrl + "/portal/register/" + token;
    }

    // ---------- legal identity re-verification ----------

    public Vendor requestIdentityChange(String id, IdentityChangeRequest req) {
        Vendor v = get(id);
        if (v.isOnboardingOpen() || v.getStatus() == VendorStatus.PENDING_VERIFICATION) {
            throw ApiException.badRequest("This vendor is not approved yet; edit the profile directly");
        }
        if (v.getStatus() == VendorStatus.BLACKLISTED || v.getStatus() == VendorStatus.REJECTED) {
            throw ApiException.badRequest("Cannot change identity of a " + v.getStatus() + " vendor");
        }
        String gstin = blankToNull(req.gstin());
        String pan = blankToNull(req.pan());
        boolean same = req.legalName().trim().equals(v.getLegalName())
                && Objects.equals(gstin, v.getGstin()) && Objects.equals(pan, v.getPan());
        if (same) throw ApiException.badRequest("Nothing to change: the details match the current record");
        if (vendors.existsByGstin(gstin, id)) throw ApiException.conflict("Another vendor already has GSTIN " + gstin);
        String actor = actorOr(req.actor(), "Procurement Admin");
        v.setPendingIdentityChange(new IdentityChange(req.legalName().trim(), gstin, pan, req.reason(), actor, LocalDateTime.now()));
        audit(v, actor, "IDENTITY_CHANGE_REQUESTED", describe(v.getLegalName(), v.getGstin()) + " -> "
                + describe(req.legalName().trim(), gstin) + " (" + req.reason() + ")");
        return vendors.save(v);
    }

    public Vendor decideIdentityChange(String id, boolean approve, String actor) {
        Vendor v = get(id);
        IdentityChange c = v.getPendingIdentityChange();
        if (c == null) throw ApiException.badRequest("No pending legal change");
        String who = actorOr(actor, "Principal");
        if (approve) {
            if (vendors.existsByGstin(c.getGstin(), id)) throw ApiException.conflict("Another vendor already has GSTIN " + c.getGstin());
            boolean gstChanged = !Objects.equals(c.getGstin(), v.getGstin());
            boolean panChanged = !Objects.equals(c.getPan(), v.getPan());
            v.setLegalName(c.getLegalName());
            v.setGstin(c.getGstin());
            v.setPan(c.getPan());
            // New registrations need fresh certificates before they count as verified.
            v.getDocuments().forEach(d -> {
                if ((gstChanged && d.getType().equals("GST_CERT")) || (panChanged && d.getType().equals("PAN"))) {
                    d.setVerification(DocVerification.PENDING);
                    d.setNumber(d.getType().equals("GST_CERT") ? c.getGstin() : c.getPan());
                }
            });
            audit(v, who, "IDENTITY_CHANGE_APPROVED", describe(c.getLegalName(), c.getGstin())
                    + (gstChanged || panChanged ? "; new certificate(s) need verification" : ""));
            messaging.notifyVendor(v, "Legal details updated",
                    "Your registered details were updated to " + describe(c.getLegalName(), c.getGstin()) + "."
                            + (gstChanged || panChanged ? " Please upload the new GST / PAN certificate on the portal." : ""));
        } else {
            audit(v, who, "IDENTITY_CHANGE_REJECTED", "Kept " + describe(v.getLegalName(), v.getGstin()));
        }
        v.setPendingIdentityChange(null);
        return vendors.save(v);
    }

    private static String describe(String name, String gstin) {
        return name + (gstin == null ? "" : " / " + gstin);
    }

    // ---------- catalogue (items supplied) ----------

    public Vendor upsertCatalogue(String id, CatalogueEntry e, String actor) {
        Vendor v = get(id);
        Item item = items.findById(e.itemId()).orElseThrow(() -> ApiException.notFound("Item", e.itemId()));
        if (!v.getCategoryIds().contains(item.getCategoryId())) {
            String cat = categories.findById(item.getCategoryId()).map(Category::getName).orElse(item.getCategoryId());
            throw ApiException.badRequest(v.getDisplayName() + " is not registered for " + cat + ". Add the category to the vendor first.");
        }
        v.getCatalogue().removeIf(x -> x.getItemId().equals(item.getId()));
        v.getCatalogue().add(new VendorItem(item.getId(), item.getName(), item.getUnit(), e.typicalPrice(),
                e.minOrderQuantity(), e.leadTimeDays() != null ? e.leadTimeDays() : v.getLeadTimeDays(), LocalDate.now()));
        v.getCatalogue().sort(Comparator.comparing(VendorItem::getItemName));
        audit(v, actorOr(actor, "Procurement Admin"), "CATALOGUE_UPDATED", item.getName() + " @ Rs " + e.typicalPrice());
        return vendors.save(v);
    }

    public Vendor removeCatalogue(String id, String itemId, String actor) {
        Vendor v = get(id);
        if (!v.getCatalogue().removeIf(x -> x.getItemId().equals(itemId))) throw ApiException.notFound("Catalogue item", itemId);
        audit(v, actorOr(actor, "Procurement Admin"), "CATALOGUE_REMOVED", itemId);
        return vendors.save(v);
    }

    /** Vendors that list this item: active ones first, then cheapest. */
    public List<Supplier> suppliersFor(String itemId) {
        return vendors.findAll().stream()
                .flatMap(v -> v.getCatalogue().stream().filter(c -> c.getItemId().equals(itemId))
                        .map(c -> new Supplier(v.getId(), v.getDisplayName(), v.getStatus(), v.getPerformance().getOverallScore(),
                                c.getTypicalPrice(), c.getMinOrderQuantity(), c.getLeadTimeDays())))
                .sorted(Comparator.comparing((Supplier x) -> x.status() != VendorStatus.ACTIVE)
                        .thenComparing(Supplier::typicalPrice))
                .toList();
    }

    // ---------- categories ----------

    public Category createCategory(CategoryRequest req) {
        String id = req.name().trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        if (id.isEmpty()) throw ApiException.badRequest("Enter a category name");
        boolean exists = categories.findAll().stream()
                .anyMatch(c -> c.getId().equals(id) || c.getName().equalsIgnoreCase(req.name().trim()));
        if (exists) throw ApiException.conflict("Category " + req.name() + " already exists");
        return categories.save(new Category(id, req.name().trim(), req.description()));
    }

    public Category updateCategory(String id, CategoryRequest req) {
        Category c = categories.findById(id).orElseThrow(() -> ApiException.notFound("Category", id));
        boolean clash = categories.findAll().stream()
                .anyMatch(o -> !o.getId().equals(id) && o.getName().equalsIgnoreCase(req.name().trim()));
        if (clash) throw ApiException.conflict("Another category is already called " + req.name());
        c.setName(req.name().trim());
        c.setDescription(req.description());
        return categories.save(c);
    }

    public void deleteCategory(String id) {
        categories.findById(id).orElseThrow(() -> ApiException.notFound("Category", id));
        long vendorCount = vendors.findAll().stream().filter(v -> v.getCategoryIds().contains(id)).count();
        long itemCount = items.findAll().stream().filter(i -> id.equals(i.getCategoryId())).count();
        if (vendorCount + itemCount > 0) {
            throw ApiException.badRequest("Category is used by " + vendorCount + " vendor(s) and " + itemCount + " item(s)");
        }
        categories.deleteById(id);
    }

    public record ExpiringDoc(String vendorId, String vendorName, String type, String expiryDate, long daysToExpiry) {}

    // ---------- helpers ----------

    void apply(Vendor v, VendorRequest r, boolean identityEditable) {
        if (identityEditable) {
            v.setLegalName(r.legalName());
            v.setGstin(blankToNull(r.gstin()));
            v.setPan(blankToNull(r.pan()));
        }
        v.setTradeName(r.tradeName());
        v.setType(r.type());
        v.setYearEstablished(r.yearEstablished());
        v.setMsmeNumber(blankToNull(r.msmeNumber()));
        v.setRegisteredAddress(r.registeredAddress());
        v.setCity(r.city());
        v.setPincode(r.pincode());
        v.setCategoryIds(new java.util.ArrayList<>(r.categoryIds()));
        v.setContacts(new java.util.ArrayList<>(r.contacts()));
        v.setPaymentTerms(r.paymentTerms());
        v.setLeadTimeDays(r.leadTimeDays());
        v.setMinOrderValue(r.minOrderValue());
        v.setPortalEnabled(r.portalEnabled());
        if (v.getBank() == null) v.setBank(toBank(r.bank()));
    }

    BankDetails toBank(BankInput b) {
        if (b == null || b.accountNumber() == null || b.accountNumber().isBlank()) return null;
        return new BankDetails(b.accountName(), b.accountNumber().trim(), b.ifsc(), b.bankName(), false);
    }

    private boolean bankDiffers(BankDetails a, BankDetails b) {
        return !Objects.equals(a.getAccountNumber(), b.getAccountNumber()) || !Objects.equals(a.getIfsc(), b.getIfsc());
    }

    private VendorDocument firstExpiredBlockingDoc(Vendor v) {
        return v.getDocuments().stream()
                .filter(d -> BLOCKING_DOCS.contains(d.getType()) && d.isExpired())
                .findFirst().orElse(null);
    }

    private void validateCategories(List<String> ids) {
        for (String id : ids) {
            if (categories.findById(id).isEmpty()) throw ApiException.badRequest("Unknown category " + id);
        }
    }

    private static void requireIn(VendorStatus current, String verb, VendorStatus... allowed) {
        for (VendorStatus s : allowed) if (s == current) return;
        throw ApiException.badRequest("Cannot " + verb + " a vendor in status " + current);
    }

    private static void requireReason(String reason) {
        if (reason == null || reason.isBlank()) throw ApiException.badRequest("A reason is required for this action");
    }

    static void audit(Vendor v, String actor, String action, String details) {
        v.getAudit().add(0, AuditEntry.of(actorOr(actor, "Procurement Admin"), action, details));
    }

    static String actorOr(String actor, String fallback) {
        return actor == null || actor.isBlank() ? fallback : actor;
    }

    static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim().toUpperCase(Locale.ROOT);
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
