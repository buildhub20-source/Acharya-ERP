// Mirrors the Spring Boot DTOs / models.

export type VendorStatus =
  | "INVITED" | "REGISTERED" | "PENDING_VERIFICATION" | "SENT_BACK" | "ACTIVE"
  | "SUSPENDED" | "BLACKLISTED" | "REJECTED" | "INACTIVE";
export type VendorType = "MANUFACTURER" | "DISTRIBUTOR" | "RETAILER" | "SERVICE";
export type Channel = "EMAIL" | "WHATSAPP" | "SMS" | "PORTAL";
export type PrStatus =
  | "DRAFT" | "RFQ_SENT" | "COLLECTING_QUOTES" | "UNDER_REVIEW" | "PENDING_APPROVAL"
  | "SENT_BACK" | "REJECTED_REQUOTE" | "APPROVED" | "PO_ISSUED" | "CANCELLED";
export type RfqStatus = "SENT" | "DELIVERED" | "READ" | "REPLIED" | "NO_RESPONSE";
export type QuoteSource = "PORTAL" | "EMAIL_TEXT" | "WHATSAPP_TEXT" | "PDF" | "IMAGE" | "VOICE" | "MANUAL";

export interface Category { id: string; name: string; description: string }
export type StockStatus = "OK" | "LOW" | "OUT";
export type MovementType = "OPENING" | "RECEIPT" | "ISSUE" | "ADJUSTMENT" | "RETURN";
export interface Item {
  id: string; sku: string; name: string; categoryId: string; unit: string; lastPurchasePrice: number;
  onHand: number; reorderLevel: number; reorderQuantity: number; location: string | null;
  avgUnitCost: number; stockValue: number; stockStatus: StockStatus;
}

export interface ContactPerson {
  name: string; role: string; phone: string; whatsapp: string; email: string;
  preferredChannel: Channel; phoneVerified: boolean; emailVerified: boolean;
}
export interface BankDetails { accountName: string; ifsc: string; bankName: string; verified: boolean; maskedAccountNumber: string }
export interface VendorDocument {
  id: string; type: string; number: string; issueDate: string | null; expiryDate: string | null;
  verification: "PENDING" | "VERIFIED" | "REJECTED"; fileName: string; expired: boolean; daysToExpiry: number | null;
}
export interface VendorPerformance {
  rfqsReceived: number; rfqsResponded: number; avgResponseHours: number; quotesWon: number;
  onTimeDeliveryPct: number; qualityAcceptancePct: number; manualRating: number;
  responseRatePct: number; overallScore: number;
}
export interface AuditEntry { at: string; by: string; action: string; details: string }

export interface Vendor {
  id: string; code: string; legalName: string; tradeName: string | null; displayName: string;
  type: VendorType; yearEstablished: number | null; status: VendorStatus; statusReason: string | null;
  gstin: string | null; pan: string | null; msmeNumber: string | null;
  registeredAddress: string; city: string; pincode: string;
  categoryIds: string[]; contacts: ContactPerson[]; documents: VendorDocument[];
  bank: BankDetails | null; pendingBankChange: BankDetails | null;
  paymentTerms: string | null; leadTimeDays: number | null; minOrderValue: number | null;
  portalEnabled: boolean; lastPortalLogin: string | null;
  performance: VendorPerformance; audit: AuditEntry[]; createdAt: string; rfqEligible: boolean;
}

export interface PrLine { itemId: string | null; description: string; specs: string; quantity: number; unit: string }
export interface Approval {
  level: "MANAGER" | "OFFICIAL"; approver: string;
  decision: "APPROVED" | "REJECTED_REQUOTE" | "SENT_BACK" | "REJECTED";
  vendorId: string | null; comments: string | null; at: string;
}
export interface PurchaseRequest {
  id: string; number: string; title: string; categoryId: string; department: string; requestedBy: string;
  lines: PrLine[]; dueDate: string; deliveryLocation: string; budgetHead: string; budgetAmount: number | null;
  quoteDeadline: string | null; status: PrStatus; round: number;
  selectedVendorId: string | null; selectedQuoteId: string | null; selectionJustification: string | null;
  purchaseOrderId: string | null; approvals: Approval[]; audit: AuditEntry[]; createdAt: string; totalQuantity: number;
}
export interface Rfq {
  id: string; reference: string; purchaseRequestId: string; round: number; vendorId: string; vendorName: string;
  channels: Channel[]; status: RfqStatus; sentAt: string; deliveredAt: string | null; readAt: string | null;
  repliedAt: string | null; reminderCount: number; lastReminderAt: string | null; message: string;
}
export interface Quote {
  id: string; rfqId: string; purchaseRequestId: string; round: number; vendorId: string; vendorName: string; version: number;
  unitPrice: number; quantity: number; taxPercent: number; deliveryCharge: number; deliveryDays: number; validityDays: number;
  paymentTerms: string | null; remarks: string | null; meetsSpecs: boolean; specDeviation: string | null;
  source: QuoteSource; rawText: string | null; attachmentName: string | null; parseConfidence: number;
  lowConfidenceFields: string[]; manuallyVerified: boolean; late: boolean; receivedAt: string;
  subtotal: number; taxAmount: number; landedCost: number; needsReview: boolean;
}
export interface ComparisonRow { rank: number; quote: Quote; l1: boolean; diffFromL1Pct: number; vendorScore: number; vendorRating: number }
export interface Comparison {
  rows: ComparisonRow[]; l1QuoteId: string | null; l1Amount: number | null; averageAmount: number | null;
  quotesReceived: number; vendorsInvited: number; minQuotesRequired: number; meetsMinQuotes: boolean;
}
export interface ApprovalPolicy { officialThreshold: number; requiresOfficial: boolean; overBudget: boolean; reason: string }
export type PoStatus = "ISSUED" | "ACCEPTED" | "DISPATCHED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
export interface PurchaseOrder {
  id: string; number: string; purchaseRequestId: string; purchaseRequestNumber: string; title: string;
  vendorId: string; vendorName: string; quoteId: string; amount: number; paymentTerms: string | null;
  expectedDelivery: string; status: PoStatus; issuedAt: string;
  itemId: string | null; categoryId: string; description: string; unit: string; orderedQuantity: number; unitCost: number;
  receivedQuantity: number; acceptedQuantity: number; rejectedQuantity: number; lastReceivedAt: string | null;
  pendingQuantity: number; overdue: boolean;
}

export interface GoodsReceipt {
  id: string; number: string; purchaseOrderId: string; purchaseOrderNumber: string; purchaseRequestId: string;
  vendorId: string; vendorName: string; itemId: string; description: string; unit: string;
  orderedQuantity: number; previouslyAccepted: number; receivedQuantity: number; acceptedQuantity: number;
  rejectedQuantity: number; rejectionReason: string | null; unitCost: number;
  deliveryChallan: string | null; invoiceNumber: string | null; invoiceAmount: number | null;
  invoiceMatch: "MATCHED" | "MISMATCH" | "NOT_PROVIDED";
  receivedDate: string; expectedDate: string; onTime: boolean; receivedBy: string; inspectedBy: string | null;
  storeLocation: string | null; notes: string | null; createdAt: string; acceptedValue: number; complete: boolean;
}
export interface StockMovement {
  id: string; itemId: string; itemName: string; unit: string; type: MovementType; quantity: number; balanceAfter: number;
  unitCost: number; reference: string; referenceId: string | null; department: string | null; issuedTo: string | null;
  reason: string | null; by: string; at: string; value: number;
}
export interface StockRow { item: Item; onOrder: number; needsReorder: boolean; openRequest: { id: string; number: string; status: string } | null }
export interface ItemDetail {
  item: Item; categoryName: string; movements: StockMovement[]; openOrders: PurchaseOrder[]; issuedLast30Days: number;
  openRequestId: string | null; openRequestNumber: string | null;
}
export interface ReceivablePo { order: PurchaseOrder; receipts: GoodsReceipt[]; item: Item | null }
export interface PurchaseRequestDetail {
  request: PurchaseRequest; categoryName: string; rfqs: Rfq[]; quotes: Quote[];
  comparison: Comparison; approvalPolicy: ApprovalPolicy; purchaseOrder: PurchaseOrder | null;
}
export interface OutboxMessage { at: string; channel: Channel; vendorId: string; vendorName: string; to: string; subject: string; body: string }
export interface ExpiringDoc { vendorId: string; vendorName: string; type: string; expiryDate: string; daysToExpiry: number }

export interface Dashboard {
  vendorCounts: Partial<Record<VendorStatus, number>>; totalVendors: number;
  prCounts: Partial<Record<PrStatus, number>>; openRequests: number; pendingApprovals: number;
  pendingVendorVerification: number; poCount: number; poValue: number; estimatedSavings: number;
  expiringDocuments: ExpiringDoc[]; pendingBankChanges: { id: string; name: string }[];
  topVendors: { id: string; name: string; score: number; rating: number; responseRate: number }[];
  recentActivity: { at: string; by: string; action: string; details: string; prId: string; prNumber: string; prTitle: string }[];
  stockValue: number; pendingDeliveries: number; overdueDeliveries: number;
  reorderItems: { id: string; name: string; onHand: number; reorderLevel: number; unit: string }[];
}

export interface PortalRfq {
  rfq: Rfq; purchaseRequestId: string; title: string; lines: PrLine[]; dueDate: string;
  deliveryLocation: string; quoteDeadline: string; open: boolean; myQuote: Quote | null;
  outcome: "OPEN" | "UNDER_EVALUATION" | "WON" | "NOT_SELECTED" | "CANCELLED" | "CLOSED";
}
