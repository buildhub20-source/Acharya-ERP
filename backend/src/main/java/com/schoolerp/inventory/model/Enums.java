package com.schoolerp.inventory.model;

/** Holder for small enums shared across the domain. */
public final class Enums {
    private Enums() {}

    public enum VendorStatus { INVITED, REGISTERED, PENDING_VERIFICATION, SENT_BACK, ACTIVE, SUSPENDED, BLACKLISTED, REJECTED, INACTIVE }

    public enum VendorType { MANUFACTURER, DISTRIBUTOR, RETAILER, SERVICE }

    public enum Channel { EMAIL, WHATSAPP, SMS, PORTAL }

    public enum DocVerification { PENDING, VERIFIED, REJECTED }

    public enum PrStatus { DRAFT, RFQ_SENT, COLLECTING_QUOTES, UNDER_REVIEW, PENDING_APPROVAL, SENT_BACK, REJECTED_REQUOTE, APPROVED, PO_ISSUED, CANCELLED }

    public enum RfqStatus { SENT, DELIVERED, READ, REPLIED, NO_RESPONSE }

    /** Format the quote arrived in; drives the "parse responses" step. */
    public enum QuoteSource { PORTAL, EMAIL_TEXT, WHATSAPP_TEXT, PDF, IMAGE, VOICE, MANUAL }

    public enum ApprovalLevel { MANAGER, OFFICIAL }

    public enum ApprovalDecision { APPROVED, REJECTED_REQUOTE, SENT_BACK, REJECTED }

    public enum PoStatus { ISSUED, ACCEPTED, DISPATCHED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED }

    public enum MovementType { OPENING, RECEIPT, ISSUE, ADJUSTMENT, RETURN }

    public enum StockStatus { OK, LOW, OUT }

    public enum InvoiceMatch { MATCHED, MISMATCH, NOT_PROVIDED }
}
