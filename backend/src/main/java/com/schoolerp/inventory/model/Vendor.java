package com.schoolerp.inventory.model;

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

    private boolean portalEnabled;
    private LocalDateTime lastPortalLogin;

    /** Channels the vendor told us to stop using (replied STOP). Nothing is sent on them again until START. */
    private List<Enums.Channel> optedOutChannels = new ArrayList<>();
    /** Set when the vendor replied DELETE MY DATA; the purchase office has to act on it. */
    private LocalDateTime dataDeletionRequestedAt;

    private VendorPerformance performance = new VendorPerformance();
    private List<AuditEntry> audit = new ArrayList<>();
    private LocalDateTime createdAt;

    public boolean isRfqEligible() {
        return status == Enums.VendorStatus.ACTIVE;
    }

    public boolean hasOptedOut(Enums.Channel channel) {
        return optedOutChannels.contains(channel);
    }

    public String getDisplayName() {
        return tradeName != null && !tradeName.isBlank() ? tradeName : legalName;
    }
}
