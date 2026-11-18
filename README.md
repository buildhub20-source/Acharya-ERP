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
| Vendors | `/vendors`, `/vendors/new`, `/vendors/[id]`, `/vendors/[id]/edit` | Onboarding (full or quick-invite), approve / send back / reject, suspend / blacklist / reactivate, documents and verification, bank-change approval, ratings and scorecard, per-vendor messages, audit log |
| Compliance | `/vendors/compliance` | Expiring docs, onboarding queue, pending bank changes, blocked vendors |
| Procurement | `/procurement`, `/procurement/new`, `/procurement/[id]` | The full 10-step flow: create → select vendors → generate and send RFQ → track and remind → parse replies (text / PDF / image / voice) → compare (L1 by landed cost) → manager review → official approval → PO |
| Approvals | `/approvals` | Level-1 and level-2 queues |
| Purchase orders | `/purchase-orders` | Issued POs |
| Messages | `/outbox` | Two-way log of every email / WhatsApp / SMS / portal message with delivery status; which channels are live; send a test; simulate a vendor reply |
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
- GRN: accepted units cannot exceed what is pending on the PO; rejected units need a reason and stay pending
  (the vendor is asked to replace them); a fully received PO cannot be received again or marked dispatched.
- Invoice matches when it is within 1% of accepted qty × PO landed unit cost.
- Each GRN updates the vendor's on-time and quality-acceptance percentages (20% weight per delivery).
- Stock never goes negative; every change is a ledger entry, and receipts re-average the unit cost.
- A custom (non-master) item gets an item-master entry on its first receipt.

## Backend layout

Diagrams of the components, the end-to-end procurement flow, state machines and the messaging layer are in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
backend/src/main/java/com/schoolerp/inventory/
  model/        domain objects (Vendor, PurchaseRequest, Rfq, Quote, PurchaseOrder…)
  repository/   InMemoryRepository + one repo per aggregate   ← swap for Supabase
  service/      VendorService, ProcurementService, InventoryService (GRN + stock ledger), QuoteParserService,
                MessagingService (routes to the vendor's channel + message log), DashboardService, ReminderScheduler
  messaging/    EmailSender (SMTP), EmailInboxPoller (IMAP), WhatsAppCloudSender, SmsGatewaySender,
                InboundReplyService (reply -> vendor -> RFQ -> quote), WebhookController, ChannelController
  web/          REST controllers (+ dto/Dtos.java, error handling)
  seed/         MockDataSeeder (delete once on Supabase)
```

Key endpoints: `GET/POST /api/vendors`, `POST /api/vendors/{id}/status`, `POST /api/purchase-requests`,
`POST /api/purchase-requests/{id}/rfqs`, `/replies`, `/quotes`, `/close-quotes`, `/review`, `/approval`,
`/api/portal/vendors/{vendorId}/…`, `GET /api/dashboard`, `GET /api/outbox`,
`GET /api/stock`, `GET /api/stock/{itemId}`, `POST /api/stock/issues`, `POST /api/stock/adjustments`,
`GET /api/stock/movements`, `GET /api/grns/pending`, `GET /api/grns/receivable/{poId}`, `POST /api/grns`,
`GET /api/channels`, `POST /api/channels/test`, `POST /api/channels/simulate-inbound`,
`GET|POST /api/webhooks/whatsapp`, `POST /api/webhooks/sms`.

## Messaging channels (Email, WhatsApp, SMS)

**How it flows.** Each vendor contact has a *preferred channel*. The RFQ goes out **only** on that channel
(falling back to the first one we have an address for). The vendor just replies, and the reply is accepted
**only if it comes back on the same channel** the RFQ went out on. It is matched to the vendor by email or phone,
then to the RFQ by the `RFQ-yyyy-nnnn` reference (email subjects keep it automatically). The parser turns it into a quote,
the vendor gets an acknowledgement on the same channel, and the comparison highlights L1. When a vendor is awarded,
they get the PO with the full requirement (item, specs, qty, rate, GST, total, delivery date and place) on their
channel, and the others get a "not selected" note on theirs. A reply with no readable price creates no quote; the vendor
is asked to resend.

A channel without credentials runs in **mock** mode: the message is logged on the Messages page but not sent.
Put credentials in `backend/.env` (copy `backend/.env.example`; the file is git-ignored and loaded at startup),
or set them as real environment variables. Never commit secrets.

> **Test safety.** The seed data has realistic-looking vendor emails and numbers. Live sends only go to
> `MESSAGING_ALLOWED_RECIPIENTS` (comma-separated emails / numbers); everyone else is logged as **Blocked**.
> Set `MESSAGING_ALLOW_ALL=true` only once you are on real vendor data.
> To test, edit a vendor's contact to your own email/number and add it to the allowlist.

| Channel | Free option used | Outbound | Replies come in via |
|---|---|---|---|
| Email | Any mailbox with SMTP/IMAP (Gmail + App Password, Outlook, Zoho) | SMTP | IMAP polling every 60 s |
| WhatsApp | Meta **WhatsApp Cloud API** (free test number, up to 5 test recipients; replies are free "service" conversations) | Graph API | webhook `/api/webhooks/whatsapp` |
| SMS | **SMSGate**: open-source Android app, uses a phone + SIM you own (no per-SMS API fee, no DLT) | Phone's local API or free cloud relay | webhook `/api/webhooks/sms` |

### Email (Gmail example)
1. Google Account → Security → turn on 2-Step Verification → **App passwords** → create one.
2. Set:
   ```
   MAIL_SMTP_HOST=smtp.gmail.com   MAIL_SMTP_PORT=587
   MAIL_IMAP_HOST=imap.gmail.com
   MAIL_USERNAME=stores@yourschool.in   MAIL_PASSWORD=<16-char app password>
   ```
   Vendor replies land in that inbox; unread mail is read every 60 s and marked read.

### WhatsApp (Meta Cloud API)
1. developers.facebook.com → create an app → add **WhatsApp**. Note the **Phone number ID** and a **token**
   (the temporary token lasts 24 h; for longer, create a System User token in Business Settings).
2. Add your own phone as a test recipient.
3. Webhooks need a public URL. In dev, run `ngrok http 8080`, then in the app's WhatsApp → Configuration set the
   callback to `https://<ngrok-id>.ngrok-free.app/api/webhooks/whatsapp` with your verify token, and subscribe to **messages**.
4. Meta only lets a business *start* a chat with an approved **template**. Create one (category Utility), e.g. `rfq_request`:
   `Dear {{1}}, Greenfield Public School requests your quotation {{2}} for {{3}}. Please reply here with your rate, GST and delivery days by {{4}}.`
5. Set:
   ```
   WHATSAPP_PHONE_NUMBER_ID=...  WHATSAPP_ACCESS_TOKEN=...
   WHATSAPP_VERIFY_TOKEN=<any string you chose in step 3>
   WHATSAPP_APP_SECRET=<App settings → Basic → App secret, used to verify webhook signatures>
   WHATSAPP_RFQ_TEMPLATE=rfq_request
   ```
   Delivered / read ticks update the RFQ tracking.

### SMS (SMSGate on an Android phone)
1. Install **SMS Gateway for Android** (sms-gate.app) on a phone with the school SIM.
2. Either turn on **Local server** (the phone and backend on the same Wi-Fi; send URL `http://<phone-ip>:8080/message`) or
   **Cloud server** (send URL `https://api.sms-gate.app/3rdparty/v1/messages`). The app shows the username and password.
3. Register the reply webhook (cloud mode shown; one call per event):
   ```bash
   curl -u USER:PASS -H "Content-Type: application/json" https://api.sms-gate.app/3rdparty/v1/webhooks -d '{"url":"https://<ngrok-id>.ngrok-free.app/api/webhooks/sms","event":"sms:received"}'
   ```
   Repeat with `sms:delivered` and `sms:failed` for delivery ticks.
4. Set:
   ```
   SMS_GATEWAY_SEND_URL=...  SMS_GATEWAY_USERNAME=...  SMS_GATEWAY_PASSWORD=...
   SMS_GATEWAY_SIGNING_KEY=<app Settings → Webhooks → Signing key>
   ```
SMS RFQs use a short text (the full spec goes by email/WhatsApp), since every 160 characters is billed as one SMS by the operator.

### Checking it
Open **Messages**. Each channel card shows *Live* or *Mock*. Use **Send a test message** to check credentials, and
**Simulate a vendor reply** to test matching without a public webhook URL.

## Moving to Supabase later
1. Create tables mirroring `model/` (vendors, vendor_contacts, vendor_documents, purchase_requests,
   pr_lines, rfqs, quotes, approvals, purchase_orders, items, goods_receipts, stock_movements, audit_log).
   Wrap `InventoryService.receive/issue/adjust` in a transaction (and lock the item row) so stock and ledger stay in step.
2. Add `spring-boot-starter-data-jpa` + the Postgres driver, point `spring.datasource.*` at Supabase,
   and replace each `InMemoryRepository` subclass with a `JpaRepository` (the services only use
   `save / findById / findAll / findWhere`-style calls).
3. Replace the mock "Acting as" switcher and the portal sign-in with Supabase Auth (JWT), and derive the user / vendor from the token.
4. Move document uploads to Supabase Storage.
5. Persist the message log (`MessageLog`) in a `messages` table. Replace `QuoteParserService` with
   OCR + speech-to-text + an LLM extractor (same output: fields + confidence), so PDF / photo / voice replies
   become quotes automatically instead of waiting for "Log reply".

## Known limits (v1)
- One line item per purchase request in the UI (the model already supports several lines; quotes are priced per unit).
- Single store location; no size/colour variants per item yet (e.g. shoe sizes are tracked in the specs text, not as separate stock).
- Rejected units are not posted as a separate "return to vendor" movement, since they never enter stock.
- Payment release to Accounts is not built; the GRN only records whether the invoice matches.
