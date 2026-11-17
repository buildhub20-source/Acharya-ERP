package com.schoolerp.inventory.web.dto;

import com.schoolerp.inventory.model.ContactPerson;
import com.schoolerp.inventory.model.Enums;
import com.schoolerp.inventory.model.PrLine;
import com.schoolerp.inventory.model.PurchaseOrder;
import com.schoolerp.inventory.model.PurchaseRequest;
import com.schoolerp.inventory.model.Quote;
import com.schoolerp.inventory.model.Rfq;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** Request / response payloads for the REST API. */
public final class Dtos {
    private Dtos() {}

    // ---------- Vendor management ----------

    public record BankInput(
            String accountName,
            String accountNumber,
            @Pattern(regexp = "^$|^[A-Z]{4}0[A-Z0-9]{6}$", message = "invalid IFSC") String ifsc,
            String bankName) {}

    public record VendorRequest(
            @NotBlank String legalName,
            String tradeName,
            @NotNull Enums.VendorType type,
            Integer yearEstablished,
            @Pattern(regexp = "^$|^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$", message = "invalid GSTIN") String gstin,
            @Pattern(regexp = "^$|^[A-Z]{5}[0-9]{4}[A-Z]$", message = "invalid PAN") String pan,
            String msmeNumber,
            String registeredAddress,
            String city,
            @Pattern(regexp = "^$|^[1-9][0-9]{5}$", message = "invalid pincode") String pincode,
            @NotEmpty List<String> categoryIds,
            @NotEmpty @Valid List<ContactPerson> contacts,
            @Valid BankInput bank,
            String paymentTerms,
            Integer leadTimeDays,
            Integer minOrderValue,
            boolean portalEnabled,
            /** true = admin adds and sends a portal invite; false = submitted for verification. */
            boolean inviteOnly,
            String actor) {}

    /** APPROVE, REJECT, SEND_BACK, SUSPEND, REACTIVATE, BLACKLIST, DEACTIVATE */
    public record VendorStatusChange(@NotBlank String action, String reason, String actor) {}

    public record DocumentRequest(
            @NotBlank String type,
            String number,
            LocalDate issueDate,
            LocalDate expiryDate,
            String fileName) {}

    public record RatingRequest(@Min(1) double rating, String actor) {}

    public record ActorRequest(String actor, String reason) {}

    // ---------- Procurement ----------

    public record PurchaseRequestCreate(
            @NotBlank String title,
            @NotBlank String categoryId,
            @NotBlank String department,
            @NotBlank String requestedBy,
            @NotEmpty @Valid List<PrLine> lines,
            @NotNull LocalDate dueDate,
            String deliveryLocation,
            String budgetHead,
            BigDecimal budgetAmount) {}

    public record SendRfqRequest(
            @NotEmpty List<String> vendorIds,
            LocalDateTime quoteDeadline,
            String actor) {}

    public record QuoteSubmission(
            @NotBlank String rfqId,
            @NotNull @DecimalMin("0.01") BigDecimal unitPrice,
            BigDecimal taxPercent,
            BigDecimal deliveryCharge,
            @Min(0) int deliveryDays,
            @Min(0) int validityDays,
            String paymentTerms,
            String remarks,
            Boolean meetsSpecs,
            String specDeviation,
            Enums.QuoteSource source) {}

    /** A raw vendor reply (WhatsApp text, email, PDF/image OCR text, voice transcript) to be parsed. */
    public record RawReplyRequest(
            @NotBlank String rfqId,
            @NotNull Enums.QuoteSource source,
            @NotBlank String rawText,
            String attachmentName) {}

    /** action = SELECT | REJECT_ALL */
    public record ManagerReviewRequest(
            @NotBlank String action,
            String quoteId,
            String justification,
            String actor) {}

    /** action = APPROVE | SEND_BACK | REJECT */
    public record OfficialDecisionRequest(
            @NotBlank String action,
            String comments,
            String actor) {}

    // ---------- Responses ----------

    public record ComparisonRow(
            int rank,
            Quote quote,
            boolean l1,
            double diffFromL1Pct,
            double vendorScore,
            double vendorRating) {}

    public record Comparison(
            List<ComparisonRow> rows,
            String l1QuoteId,
            BigDecimal l1Amount,
            BigDecimal averageAmount,
            int quotesReceived,
            int vendorsInvited,
            int minQuotesRequired,
            boolean meetsMinQuotes) {}

    public record ApprovalPolicy(
            BigDecimal officialThreshold,
            boolean requiresOfficial,
            boolean overBudget,
            String reason) {}

    public record PurchaseRequestDetail(
            PurchaseRequest request,
            String categoryName,
            List<Rfq> rfqs,
            List<Quote> quotes,
            Comparison comparison,
            ApprovalPolicy approvalPolicy,
            PurchaseOrder purchaseOrder) {}

    public record OutboxMessage(
            LocalDateTime at,
            Enums.Channel channel,
            String vendorId,
            String vendorName,
            String to,
            String subject,
            String body) {}
}
