# Greenfield School ERP: Inventory (Vendor Management + Procurement)

Next.js 16 (React 19, Tailwind 4) frontend + Spring Boot 4.1 (Java 17) backend.
The backend runs on **in-memory mock data** that's reseeded on every restart. Supabase comes later (see below).

## Run it

```bash
# 1) Backend: http://localhost:8080
cd backend
./mvnw spring-boot:run          # Windows: mvnw.cmd spring-boot:run

# 2) Frontend: http://localhost:3000
cd frontend
npm install
npm run dev
```

The frontend reads the API URL from `frontend/.env.local` (`NEXT_PUBLIC_API_URL=http://localhost:8080`).

Use the **"Acting as"** switcher in the top bar to change role:
- **Store Manager**: creates requests, selects vendors, reviews quotes
- **Principal**: second-level approval, bank-change approval
- **Procurement Admin**: vendor onboarding and compliance

`/portal` is the vendor-facing portal, with a mock sign-in that lets you pick any portal-enabled vendor.

## What's in it

| Area | Pages | Covers |
|---|---|---|
| Dashboard | `/` | KPIs, pipeline by step, items needing attention, activity, top vendors |
| Vendors | `/vendors`, `/vendors/new`, `/vendors/[id]`, `/vendors/[id]/edit` | Directory with filters and CSV export; add or invite; verify / send back / reject; suspend / blacklist / reactivate; tabs for overview, **catalogue** (items supplied with typical price, MOQ, lead time), **activity** (RFQs, quotes and rank, POs, deliveries), documents, scorecard, messages, audit log; bank-change and **legal-change re-verification** approvals; resend onboarding link |
| Categories | `/vendors/categories` | Create / rename / delete (only when unused); active-vendor coverage against the 3-quote policy |
| Vendor reports | `/vendors/reports` | Spend by vendor with dependency (>40%) flag, category coverage, ranked scorecard, status breakdown, CSV export |
| Supplier onboarding | `/portal/register`, `/portal/register/[token]` | Public "become a supplier" form; 5-step wizard from the personal invite link: business, contacts with OTP verification, bank and terms, documents, review and submit |
| Compliance | `/vendors/compliance` | Expiring docs, onboarding queue, pending bank changes, blocked vendors |
| Procurement | `/procurement`, `/procurement/new`, `/procurement/[id]` | The full 10-step flow: create → select vendors → generate and send RFQ → track and remind → parse replies (text / PDF / image / voice) → compare (L1 by landed cost) → manager review → official approval → PO |
| Approvals | `/approvals` | Level-1 and level-2 queues |
| Purchase orders | `/purchase-orders` | Issued POs |
| Outbox | `/outbox` | Mock log of every email / WhatsApp / SMS / portal message |
| Stock | `/inventory`, `/inventory/[itemId]` | On hand, reorder level, quantity on order, weighted-average cost, value; reorder alerts that pre-fill a purchase request (skipped if one is already in progress); issue to department; adjustments with a reason; per-item ledger and settings |
| Goods receipt | `/inventory/receipts`, `/inventory/receipts/new?po=`, `/inventory/receipts/[id]` | Deliveries awaiting receipt (overdue flagged), GRN with accept/reject on inspection, partial deliveries, on-time check, invoice match against accepted value (3-way) |
| Stock ledger | `/inventory/movements` | Append-only receipts / issues / adjustments / opening, consumption by department |
| Vendor portal | `/portal`, `/portal/[vendorId]` | Sealed-bid quote form, PO accept / dispatch, document renewal, messages |

### Business rules enforced (backend)
- Only `ACTIVE` vendors receive RFQs. An expired GST / trade licence / FSSAI auto-suspends the vendor.
- GSTIN, PAN, IFSC and pincode are format-validated, and GSTIN must be unique.
- Approving a vendor needs at least one verified contact channel.
- Legal name and GSTIN of an approved vendor are locked. A bank change is parked until an approver signs off, and the raw account number is never returned by the API.
- Fewer than 3 quotes, or picking a non-L1 quote, requires a written justification.
- Low-confidence parsed quotes must be verified before they can be selected.
- Above ₹10,000 or over budget, a second-level approval is needed (`app.approval.official-threshold`).
- Reject all → new RFQ round. Official "send back" → returns to manager review. Official "reject" → cancelled.
- Auto-reminder sweep every 10 min (24h interval, max 3), after which the vendor is marked No Response.
- Vendors can only be approved after the profile is submitted. Submission needs GSTIN, PAN, full address, a category,
  a contact verified by OTP, bank details and GST + PAN documents. Contacts can't mark themselves verified; changing a
  verified number or email clears its verification.
- Onboarding links carry a random secret token (never returned by the vendor APIs). OTPs expire in 10 minutes and lock
  after 5 wrong tries; in mock mode (`app.mock-mode=true`) the code is shown on screen because nothing is really sent.
- Legal name / GSTIN / PAN of an approved vendor change only through an approved re-verification request; a new GSTIN or
  PAN resets that certificate to pending.
- A catalogue item must belong to one of the vendor's categories; vendors listing the requested item are suggested first for RFQs.
- GRN: accepted units cannot exceed what is pending on the PO; rejected units need a reason and stay pending
  (the vendor is asked to replace them); a fully received PO cannot be received again or marked dispatched.
- Invoice matches when it is within 1% of accepted qty × PO landed unit cost.
- Each GRN updates the vendor's on-time and quality-acceptance percentages (20% weight per delivery).
- Stock never goes negative; every change is a ledger entry, and receipts re-average the unit cost.
- A custom (non-master) item gets an item-master entry on its first receipt.

## Backend layout

```
backend/src/main/java/com/schoolerp/inventory/
  model/        domain objects (Vendor, PurchaseRequest, Rfq, Quote, PurchaseOrder…)
  repository/   InMemoryRepository + one repo per aggregate   ← swap for Supabase
  service/      VendorService, ProcurementService, InventoryService (GRN + stock ledger), QuoteParserService,
                MessagingService (mock channels), DashboardService, ReminderScheduler
  web/          REST controllers (+ dto/Dtos.java, error handling)
  seed/         MockDataSeeder (delete once on Supabase)
```

Key endpoints: `GET/POST /api/vendors`, `POST /api/vendors/{id}/status`, `POST /api/purchase-requests`,
`POST /api/purchase-requests/{id}/rfqs`, `/replies`, `/quotes`, `/close-quotes`, `/review`, `/approval`,
`/api/portal/vendors/{vendorId}/…`, `GET /api/dashboard`, `GET /api/outbox`,
`GET /api/stock`, `GET /api/stock/{itemId}`, `POST /api/stock/issues`, `POST /api/stock/adjustments`,
`GET /api/stock/movements`, `GET /api/vendors/reports`, `GET /api/vendors/{id}/activity`,
`POST /api/vendors/{id}/invite`, `POST /api/vendors/{id}/identity-change[/approve|/reject]`, `POST|DELETE /api/vendors/{id}/catalogue`,
`GET /api/items/{itemId}/suppliers`, `POST|PUT|DELETE /api/categories`, `POST /api/portal/register`,
`GET|PUT /api/portal/onboarding/{token}` (+ `/otp`, `/otp/verify`, `/documents`, `/submit`), `GET /api/grns/pending`, `GET /api/grns/receivable/{poId}`, `POST /api/grns`.

## Moving to Supabase later
1. Create tables mirroring `model/` (vendors, vendor_contacts, vendor_documents, purchase_requests,
   pr_lines, rfqs, quotes, approvals, purchase_orders, items, goods_receipts, stock_movements, audit_log).
   Wrap `InventoryService.receive/issue/adjust` in a transaction (and lock the item row) so stock and ledger stay in step.
2. Add `spring-boot-starter-data-jpa` + the Postgres driver, point `spring.datasource.*` at Supabase,
   and replace each `InMemoryRepository` subclass with a `JpaRepository` (the services only use
   `save / findById / findAll / findWhere`-style calls).
3. Replace the mock "Acting as" switcher and the portal sign-in with Supabase Auth (JWT), and derive the user / vendor from the token.
4. Move document uploads to Supabase Storage.
5. Replace `MessagingService` with real SMTP / WhatsApp Business / SMS adapters, and `QuoteParserService`
   with OCR + speech-to-text + an LLM extractor (same output: fields + confidence).

## Known limits (v1)
- One line item per purchase request in the UI (the model already supports several lines; quotes are priced per unit).
- One login per vendor (no separate owner / sales-rep users yet); document files are not stored, only their details.
- Single store location; no size/colour variants per item yet (e.g. shoe sizes are tracked in the specs text, not as separate stock).
- Rejected units are not posted as a separate "return to vendor" movement, since they never enter stock.
- Payment release to Accounts is not built; the GRN only records whether the invoice matches.
