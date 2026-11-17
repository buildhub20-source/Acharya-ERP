package com.schoolerp.inventory.service;

import com.schoolerp.inventory.model.ContactPerson;
import com.schoolerp.inventory.model.Enums.Channel;
import com.schoolerp.inventory.model.Enums.DocVerification;
import com.schoolerp.inventory.model.Enums.VendorStatus;
import com.schoolerp.inventory.model.Vendor;
import com.schoolerp.inventory.model.VendorDocument;
import com.schoolerp.inventory.repository.Repositories.CategoryRepository;
import com.schoolerp.inventory.repository.Repositories.VendorRepository;
import com.schoolerp.inventory.web.ApiException;
import com.schoolerp.inventory.web.dto.Dtos.DocumentRequest;
import com.schoolerp.inventory.web.dto.Dtos.VendorRequest;
import com.schoolerp.inventory.web.dto.VendorDtos.InviteLink;
import com.schoolerp.inventory.web.dto.VendorDtos.OnboardingView;
import com.schoolerp.inventory.web.dto.VendorDtos.OtpSent;
import com.schoolerp.inventory.web.dto.VendorDtos.SelfRegistration;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * The vendor's side of onboarding: self-registration, completing the profile through a
 * personal link, verifying contacts by OTP, uploading documents and submitting for review.
 * Access is by the secret onboarding token only (no login yet); replace with Supabase Auth later.
 */
@Service
public class OnboardingService {

    private static final int OTP_MINUTES = 10;
    private static final int OTP_MAX_ATTEMPTS = 5;
    private static final List<String> REQUIRED_DOCS = List.of("GST_CERT", "PAN");

    private final VendorRepository vendors;
    private final CategoryRepository categories;
    private final VendorService vendorService;
    private final MessagingService messaging;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Otp> otps = new ConcurrentHashMap<>();

    /** In mock mode the OTP is echoed back to the UI because no SMS/email is really sent. */
    @Value("${app.mock-mode:true}")
    private boolean mockMode;

    private record Otp(String code, LocalDateTime expiresAt, int attempts) {}

    public OnboardingService(VendorRepository vendors, CategoryRepository categories, VendorService vendorService,
                             MessagingService messaging) {
        this.vendors = vendors;
        this.categories = categories;
        this.vendorService = vendorService;
        this.messaging = messaging;
    }

    // ------------------------------------------------------------------ entry points

    public InviteLink selfRegister(SelfRegistration r) {
        for (String c : r.categoryIds()) {
            if (categories.findById(c).isEmpty()) throw ApiException.badRequest("Unknown category " + c);
        }
        String phone = r.phone().replace(" ", "");
        boolean duplicate = vendors.findAll().stream()
                .flatMap(v -> v.getContacts().stream())
                .anyMatch(c -> c.getPhone() != null && c.getPhone().replace(" ", "").endsWith(phone.substring(Math.max(0, phone.length() - 10))));
        if (duplicate) {
            throw ApiException.conflict("This phone number is already registered. Ask the school to resend your onboarding link.");
        }
        Vendor v = new Vendor();
        v.setId(vendors.nextId());
        v.setCode("VND-" + String.format("%04d", vendors.count() + 1));
        v.setLegalName(r.legalName().trim());
        v.setTradeName(r.tradeName());
        v.setType(r.type());
        v.setCity(r.city());
        v.setCategoryIds(new ArrayList<>(r.categoryIds()));
        v.getContacts().add(new ContactPerson(r.contactName(), "Owner", r.phone(), r.phone(), r.email(), Channel.WHATSAPP, false, false));
        v.setPortalEnabled(true);
        v.setStatus(VendorStatus.REGISTERED);
        v.setCreatedAt(LocalDateTime.now());
        v.setOnboardingToken(UUID.randomUUID().toString().replace("-", ""));
        VendorService.audit(v, r.contactName(), "SELF_REGISTERED", "Registered on the vendor portal");
        vendors.save(v);
        return vendorService.sendInvite(v.getId());
    }

    public OnboardingView view(String token) {
        return toView(byToken(token));
    }

    /** Saves a draft of the profile. Verified flags are kept only for unchanged phone numbers / emails. */
    public OnboardingView save(String token, VendorRequest req) {
        Vendor v = editable(token);
        for (String c : req.categoryIds()) {
            if (categories.findById(c).isEmpty()) throw ApiException.badRequest("Unknown category " + c);
        }
        if (vendors.existsByGstin(req.gstin(), v.getId())) {
            throw ApiException.conflict("GSTIN " + req.gstin() + " is already registered with the school");
        }
        List<ContactPerson> previous = v.getContacts();
        List<ContactPerson> incoming = new ArrayList<>();
        for (ContactPerson c : req.contacts()) {
            ContactPerson copy = new ContactPerson(c.getName(), c.getRole(), c.getPhone(),
                    blank(c.getWhatsapp()) ? c.getPhone() : c.getWhatsapp(), c.getEmail(), c.getPreferredChannel(), false, false);
            copy.setPhoneVerified(previous.stream().anyMatch(p -> p.isPhoneVerified() && Objects.equals(norm(p.getPhone()), norm(c.getPhone()))));
            copy.setEmailVerified(previous.stream().anyMatch(p -> p.isEmailVerified() && p.getEmail() != null
                    && p.getEmail().equalsIgnoreCase(c.getEmail())));
            incoming.add(copy);
        }
        vendorService.apply(v, req, true);
        v.setContacts(incoming);
        v.setPortalEnabled(true);
        if (req.bank() != null && !blank(req.bank().accountNumber())) v.setBank(vendorService.toBank(req.bank()));
        if (v.getStatus() == VendorStatus.INVITED) v.setStatus(VendorStatus.REGISTERED);
        VendorService.audit(v, contactName(v), "PROFILE_SAVED", "Draft saved on the portal");
        vendors.save(v);
        return toView(v);
    }

    public OnboardingView addDocument(String token, DocumentRequest req) {
        Vendor v = editable(token);
        String type = req.type().toUpperCase(Locale.ROOT);
        v.getDocuments().removeIf(d -> d.getType().equalsIgnoreCase(type));
        v.getDocuments().add(new VendorDocument(UUID.randomUUID().toString(), type, req.number(), req.issueDate(),
                req.expiryDate(), DocVerification.PENDING, blank(req.fileName()) ? type.toLowerCase(Locale.ROOT) + ".pdf" : req.fileName()));
        VendorService.audit(v, contactName(v), "DOCUMENT_UPLOADED", type);
        vendors.save(v);
        return toView(v);
    }

    public OnboardingView removeDocument(String token, String docId) {
        Vendor v = editable(token);
        if (!v.getDocuments().removeIf(d -> d.getId().equals(docId))) throw ApiException.notFound("Document", docId);
        vendors.save(v);
        return toView(v);
    }

    // ------------------------------------------------------------------ OTP

    public OtpSent sendOtp(String token, int index, String channel) {
        Vendor v = editable(token);
        ContactPerson c = contact(v, index);
        boolean phone = isPhone(channel);
        String to = phone ? c.getPhone() : c.getEmail();
        if (blank(to)) throw ApiException.badRequest("Add a " + (phone ? "phone number" : "email") + " for " + c.getName() + " first, then save");
        String code = String.format("%06d", random.nextInt(1_000_000));
        otps.put(key(token, index, phone), new Otp(code, LocalDateTime.now().plusMinutes(OTP_MINUTES), 0));
        messaging.sendOtp(v, c, phone, code);
        return new OtpSent(phone ? "PHONE" : "EMAIL", mask(to, phone), OTP_MINUTES, mockMode ? code : null);
    }

    public OnboardingView verifyOtp(String token, int index, String channel, String code) {
        Vendor v = editable(token);
        ContactPerson c = contact(v, index);
        boolean phone = isPhone(channel);
        String k = key(token, index, phone);
        Otp otp = otps.get(k);
        if (otp == null || otp.expiresAt().isBefore(LocalDateTime.now())) {
            otps.remove(k);
            throw ApiException.badRequest("Code expired or not requested. Send a new code.");
        }
        if (otp.attempts() >= OTP_MAX_ATTEMPTS) {
            otps.remove(k);
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many wrong attempts. Send a new code.");
        }
        if (!otp.code().equals(code.trim())) {
            otps.put(k, new Otp(otp.code(), otp.expiresAt(), otp.attempts() + 1));
            throw ApiException.badRequest("Incorrect code (" + (OTP_MAX_ATTEMPTS - otp.attempts() - 1) + " attempts left)");
        }
        otps.remove(k);
        if (phone) c.setPhoneVerified(true); else c.setEmailVerified(true);
        VendorService.audit(v, c.getName(), phone ? "PHONE_VERIFIED" : "EMAIL_VERIFIED", mask(phone ? c.getPhone() : c.getEmail(), phone));
        vendors.save(v);
        return toView(v);
    }

    // ------------------------------------------------------------------ submit

    public OnboardingView submit(String token) {
        Vendor v = editable(token);
        List<String> missing = missing(v);
        if (!missing.isEmpty()) throw ApiException.badRequest("Complete these first: " + String.join(", ", missing));
        VendorStatus from = v.getStatus();
        v.setStatus(VendorStatus.PENDING_VERIFICATION);
        v.setStatusReason(null);
        v.setSubmittedAt(LocalDateTime.now());
        VendorService.audit(v, contactName(v), from == VendorStatus.SENT_BACK ? "RESUBMITTED" : "SUBMITTED",
                from + " -> PENDING_VERIFICATION");
        vendors.save(v);
        messaging.notifyVendor(v, "Registration received",
                "Thank you. Your profile is with the school's procurement team for verification. "
                        + "You will hear from us once it is approved.");
        return toView(v);
    }

    // ------------------------------------------------------------------ helpers

    /** Checklist shown to the vendor; submission is blocked until it is empty. */
    public static List<String> missing(Vendor v) {
        List<String> m = new ArrayList<>();
        if (blank(v.getLegalName())) m.add("Legal name");
        if (blank(v.getGstin())) m.add("GSTIN");
        if (blank(v.getPan())) m.add("PAN");
        if (blank(v.getRegisteredAddress()) || blank(v.getCity()) || blank(v.getPincode())) m.add("Full address");
        if (v.getCategoryIds().isEmpty()) m.add("At least one category");
        if (v.getContacts().isEmpty()) m.add("A contact person");
        if (v.getContacts().stream().noneMatch(c -> c.isPhoneVerified() || c.isEmailVerified())) m.add("Verify a phone or email by OTP");
        if (v.getBank() == null) m.add("Bank details");
        for (String doc : REQUIRED_DOCS) {
            if (v.getDocuments().stream().noneMatch(d -> d.getType().equals(doc))) {
                m.add(doc.equals("GST_CERT") ? "GST certificate" : "PAN card");
            }
        }
        return m;
    }

    private OnboardingView toView(Vendor v) {
        List<String> m = missing(v);
        return new OnboardingView(v, m, v.isOnboardingOpen() && m.isEmpty(), v.isOnboardingOpen());
    }

    private Vendor byToken(String token) {
        if (blank(token) || token.length() < 20) throw ApiException.notFound("Onboarding link", "invalid");
        return vendors.findAll().stream().filter(v -> token.equals(v.getOnboardingToken())).findFirst()
                .orElseThrow(() -> ApiException.notFound("Onboarding link", "expired or invalid"));
    }

    private Vendor editable(String token) {
        Vendor v = byToken(token);
        if (!v.isOnboardingOpen()) {
            throw ApiException.badRequest(v.getStatus() == VendorStatus.PENDING_VERIFICATION
                    ? "Your profile has been submitted and is being verified"
                    : "This profile can no longer be edited here (" + v.getStatus() + ")");
        }
        return v;
    }

    private ContactPerson contact(Vendor v, int index) {
        if (index < 0 || index >= v.getContacts().size()) throw ApiException.badRequest("Unknown contact; save your contacts first");
        return v.getContacts().get(index);
    }

    private static String key(String token, int index, boolean phone) {
        return token + ":" + index + ":" + (phone ? "P" : "E");
    }

    private static boolean isPhone(String channel) {
        return "PHONE".equalsIgnoreCase(channel) || "SMS".equalsIgnoreCase(channel);
    }

    private static String mask(String to, boolean phone) {
        if (to == null) return "-";
        if (phone) {
            String digits = to.replaceAll("[^0-9]", "");
            return "******" + digits.substring(Math.max(0, digits.length() - 4));
        }
        int at = to.indexOf('@');
        return at <= 1 ? to : to.charAt(0) + "***" + to.substring(at);
    }

    private static String norm(String phone) {
        return phone == null ? null : phone.replaceAll("[^0-9]", "");
    }

    private static String contactName(Vendor v) {
        return v.getContacts().isEmpty() ? "Vendor" : v.getContacts().get(0).getName();
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
