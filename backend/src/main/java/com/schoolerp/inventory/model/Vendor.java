package com.schoolerp.inventory.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class Vendor {
    private String id;
    private String code;
    private String legalName;
    private String tradeName;
    private Enums.VendorType type;
    private Integer yearEstablished;
    private Enums.VendorStatus status;
    private String statusReason;

    private String gstin;
    private String pan;
    private String msmeNumber;

    private String registeredAddress;
    private String city;
    private String pincode;

    private List<String> categoryIds = new ArrayList<>();
    private List<ContactPerson> contacts = new ArrayList<>();
    private List<VendorDocument> documents = new ArrayList<>();
    private BankDetails bank;
    /** Proposed bank change waiting for approver sign-off (fraud guard). */
    private BankDetails pendingBankChange;

    /** ADVANCE, NET_15, NET_30 */
    private String paymentTerms;
    private Integer leadTimeDays;
    private Integer minOrderValue;

    /** Proposed legal-identity change (legal name / GSTIN / PAN) awaiting re-verification. */
    private IdentityChange pendingIdentityChange;

    /** Items this vendor supplies, with typical price and minimum order (UC-3). */
    private List<VendorItem> catalogue = new ArrayList<>();

    private boolean portalEnabled;
    private LocalDateTime lastPortalLogin;

    /** Secret token in the onboarding link. Never serialised; admins get the link from a dedicated endpoint. */
    @JsonIgnore
    private String onboardingToken;
    private LocalDateTime inviteSentAt;
    private LocalDateTime submittedAt;

    private VendorPerformance performance = new VendorPerformance();
    private List<AuditEntry> audit = new ArrayList<>();
    private LocalDateTime createdAt;

    public boolean isRfqEligible() {
        return status == Enums.VendorStatus.ACTIVE;
    }

    /** Onboarding is open while the vendor is still completing or correcting its profile. */
    public boolean isOnboardingOpen() {
        return status == Enums.VendorStatus.INVITED || status == Enums.VendorStatus.REGISTERED
                || status == Enums.VendorStatus.SENT_BACK;
    }

    public String getDisplayName() {
        return tradeName != null && !tradeName.isBlank() ? tradeName : legalName;
    }
}
