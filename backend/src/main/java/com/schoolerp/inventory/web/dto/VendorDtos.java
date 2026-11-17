package com.schoolerp.inventory.web.dto;

import com.schoolerp.inventory.model.Enums;
import com.schoolerp.inventory.model.Vendor;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.math.BigDecimal;
import java.util.List;

/** Payloads for vendor onboarding, re-verification, catalogue and categories. */
public final class VendorDtos {
    private VendorDtos() {}

    /** Public "become a supplier" form; creates a REGISTERED vendor and returns its onboarding link. */
    public record SelfRegistration(
            @NotBlank String legalName,
            String tradeName,
            @NotNull Enums.VendorType type,
            @NotBlank String city,
            @NotBlank String contactName,
            @NotBlank @Pattern(regexp = "^\\+?[0-9 ]{10,15}$", message = "invalid phone number") String phone,
            @Email String email,
            @NotEmpty List<String> categoryIds) {}

    public record OnboardingView(Vendor vendor, List<String> missing, boolean canSubmit, boolean editable) {}

    /** channel = PHONE | EMAIL */
    public record OtpRequest(@Min(0) int contactIndex, @NotBlank String channel) {}

    public record OtpVerify(@Min(0) int contactIndex, @NotBlank String channel, @NotBlank String code) {}

    /** devCode is only filled in mock mode, so the demo can be completed without a real SMS/email. */
    public record OtpSent(String channel, String sentTo, int expiresInMinutes, String devCode) {}

    public record InviteLink(String link, String sentTo) {}

    public record IdentityChangeRequest(
            @NotBlank String legalName,
            @Pattern(regexp = "^$|^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$", message = "invalid GSTIN") String gstin,
            @Pattern(regexp = "^$|^[A-Z]{5}[0-9]{4}[A-Z]$", message = "invalid PAN") String pan,
            @NotBlank String reason,
            String actor) {}

    public record CatalogueEntry(
            @NotBlank String itemId,
            @NotNull @DecimalMin("0.01") BigDecimal typicalPrice,
            @Min(1) Integer minOrderQuantity,
            @Min(0) Integer leadTimeDays) {}

    public record CategoryRequest(@NotBlank String name, String description) {}

    public record Supplier(String vendorId, String vendorName, Enums.VendorStatus status, double score,
                           BigDecimal typicalPrice, Integer minOrderQuantity, Integer leadTimeDays) {}
}
