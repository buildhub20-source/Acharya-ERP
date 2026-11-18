# Architecture and project flow

Greenfield School ERP, Inventory module: vendor management, procurement (PR → RFQ → quotes → approval → PO),
goods receipt and stock. This document covers how the pieces fit together and how a purchase moves through
the system, with the vendor messaging layer (Email / WhatsApp / SMS) in detail.

Status: architecture and flow are built and tested in **mock mode**. Connecting real providers (Gmail, WhatsApp
Cloud API, SMSGate) and moving storage to Supabase are the next steps; see [Configuration](#7-configuration-next-step).

---

## 1. System context

```mermaid
flowchart LR
    subgraph School["School staff (browser)"]
        SM[Store Manager]
        PR[Principal / Official]
        PA[Procurement Admin]
    end
    V[Vendors]

    FE["Next.js frontend<br/>:3000"]
    BE["Spring Boot backend<br/>:8080 /api"]
    DB[("In-memory store<br/>(Supabase later)")]

    subgraph Providers["Messaging providers"]
        SMTP["Gmail SMTP / IMAP"]
        WA["WhatsApp Cloud API"]
        SMS["SMSGate (Android phone + SIM)"]
    end

    SM & PR & PA --> FE
    FE -- REST/JSON --> BE
    BE --> DB
    BE -- send --> SMTP & WA & SMS
    SMTP -- "IMAP poll (replies)" --> BE
    WA -- "webhook (replies, ticks)" --> BE
    SMS -- "webhook (replies, ticks)" --> BE
    SMTP & WA & SMS <--> V
    V -. "vendor portal (optional)" .-> FE
```

The school talks to each vendor on **one channel: the vendor's preferred one**. The vendor replies on that same
channel, and the backend turns the reply into a quote. Vendors never need to log in, though portal-enabled vendors can.

---

## 2. Components

### Backend (`backend/src/main/java/com/schoolerp/inventory/`)

```mermaid
flowchart TB
    subgraph web["web/ — REST controllers"]
        VC[VendorController]
        PC[ProcurementController]
        IC[InventoryController]
        POC[PortalController]
    end
    subgraph msg["messaging/ — channel layer"]
        CC[ChannelController<br/>/api/channels]
        WH[WebhookController<br/>/api/webhooks/*]
        IMAP[EmailInboxPoller<br/>scheduled]
        IRS[InboundReplyService]
        ES[EmailSender]
        WS[WhatsAppCloudSender]
        SS[SmsGatewaySender]
    end
    subgraph svc["service/ — business logic"]
        VS[VendorService]
        PS[ProcurementService]
        MS[MessagingService]
        QP[QuoteParserService]
        INV[InventoryService]
        RS[ReminderScheduler]
        DS[DashboardService]
    end
    REPO["repository/ — InMemoryRepository per aggregate"]

    VC --> VS
    PC --> PS
    IC --> INV
    POC --> PS & VS
    PS --> MS & QP
    VS --> MS
    RS --> PS
    MS --> ES & WS & SS
    WH --> IRS
    IMAP --> IRS
    CC --> MS & IRS
    IRS --> PS & QP & MS
    WH -- "delivery ticks" --> MS & PS
    VS & PS & INV --> REPO
```

| Layer | Responsibility |
|---|---|
| `web/` | HTTP in/out, validation, error mapping. No business rules. |
| `service/ProcurementService` | The procurement state machine: RFQ rounds, quotes, comparison (L1), review, approval, PO. |
| `service/MessagingService` | Picks the vendor's channel, builds message text, calls the right sender, keeps the two-way message log, enforces the test allowlist. |
| `messaging/*Sender` | One class per provider behind the `ChannelSender` interface. Mock when not configured. |
| `messaging/InboundReplyService` | Reply → vendor → RFQ → parsed quote → acknowledgement. |
| `messaging/WebhookController`, `EmailInboxPoller` | Transport for inbound replies and delivery/read receipts. Verify provider signatures. |
| `service/QuoteParserService` | Free text → price, GST, delivery charge/days, validity, terms, plus a confidence score. |
| `repository/` | In-memory now; same method shapes as Spring Data so it can be swapped for Supabase/Postgres. |

### Frontend (`frontend/src/`)

| Route | Used by | Purpose |
|---|---|---|
| `/procurement`, `/procurement/[id]` | Store Manager | Create request, pick vendors, track RFQs, compare quotes, review |
| `/approvals` | Principal | Second-level approval |
| `/vendors`, `/vendors/compliance` | Procurement Admin | Onboarding, documents, preferred channel per contact |
| `/outbox` (Messages) | All | Two-way message log, channel status, test send, simulate reply |
| `/purchase-orders`, `/inventory/*` | Store | POs, goods receipt, stock |
| `/portal/[vendorId]` | Vendor | Optional sealed-bid quote form and PO acknowledgement |

---

## 3. End-to-end procurement flow

```mermaid
sequenceDiagram
    autonumber
    actor M as Store Manager
    participant APP as ERP (frontend + backend)
    participant CH as Vendor's channel<br/>(Email / WhatsApp / SMS)
    actor V as Vendors
    actor O as Principal

    M->>APP: Create purchase request (e.g. 20 pairs of shoes, specs, due date)
    APP-->>M: Suggested vendors for the category
    M->>APP: Select vendors, send RFQ
    loop each vendor
        APP->>CH: RFQ on vendor's preferred channel only
        CH->>V: Message (reference RFQ-yyyy-nnnn)
    end
    CH-->>APP: Delivered / read ticks (WhatsApp, SMS)
    opt no reply in 24h
        APP->>CH: Auto reminder (max 3), then "No response"
    end
    V->>CH: Reply with price on the same channel
    CH->>APP: IMAP poll / webhook
    APP->>APP: Match vendor + RFQ, parse into quote
    APP->>CH: "Quotation received" acknowledgement
    M->>APP: Close quotes
    APP-->>M: Comparison, lowest landed cost (L1) highlighted
    M->>APP: Select vendor (justify if not L1 or < 3 quotes)
    alt above ₹10,000 or over budget
        APP->>O: Pending approval
        O->>APP: Approve / send back / reject
    end
    APP->>CH: PO with full requirement to the winner
    APP->>CH: "Not selected" to the other vendors
```

### Purchase request states

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> RFQ_SENT: send RFQs
    RFQ_SENT --> COLLECTING_QUOTES: first quote received
    COLLECTING_QUOTES --> UNDER_REVIEW: close quotes
    RFQ_SENT --> UNDER_REVIEW: close quotes
    UNDER_REVIEW --> PENDING_APPROVAL: select (needs official)
    UNDER_REVIEW --> APPROVED: select (within limits)
    UNDER_REVIEW --> REJECTED_REQUOTE: reject all
    REJECTED_REQUOTE --> RFQ_SENT: new round
    PENDING_APPROVAL --> APPROVED: official approves
    PENDING_APPROVAL --> SENT_BACK: official sends back
    SENT_BACK --> PENDING_APPROVAL: manager re-selects
    SENT_BACK --> APPROVED: manager re-selects (within limits)
    PENDING_APPROVAL --> CANCELLED: official rejects
    APPROVED --> PO_ISSUED: PO created and sent
    PO_ISSUED --> [*]
    CANCELLED --> [*]
```

### RFQ (per vendor) states

```mermaid
stateDiagram-v2
    [*] --> SENT
    SENT --> FAILED: provider error
    FAILED --> SENT: retry send
    SENT --> DELIVERED: delivery tick
    DELIVERED --> READ: read tick / reply without price
    SENT --> READ
    SENT --> REPLIED: quote received
    DELIVERED --> REPLIED
    READ --> REPLIED
    SENT --> NO_RESPONSE: deadline passed + 3 reminders, or quotes closed
    DELIVERED --> NO_RESPONSE
    READ --> NO_RESPONSE
```

---

## 4. Messaging layer

### 4.1 Outbound: which channel?

```mermaid
flowchart TD
    A[Message for a vendor] --> B{Primary contact's preferred channel<br/>has an address?}
    B -- yes --> C[Use preferred channel]
    B -- no --> D[First reachable of<br/>WhatsApp → Email → SMS → Portal]
    C & D --> E{Provider configured?}
    E -- no --> F[Log as MOCK]
    E -- yes --> G{Recipient on allowlist?<br/>or ALLOW_ALL}
    G -- no --> H[Log as BLOCKED]
    G -- yes --> I[Send via provider]
    I --> J{OK?}
    J -- yes --> K[SENT + store provider message id]
    J -- no --> L[FAILED + error shown on RFQ]
```

The chosen channel is saved on the RFQ. Reminders, the acknowledgement, the PO and the "not selected" note all
reuse **that same channel**, so a vendor only ever hears from the school in one place.

Message formats per channel:

| | RFQ | PO (award) |
|---|---|---|
| Email | Full RFQ: items, specs, qty, delivery date and place, reply-by, what to include | Full PO: item, specs, qty, rate, GST, delivery charge, total, deliver by/to, payment terms |
| WhatsApp | Approved template to open the chat (Meta rule), then free text | Full PO text |
| SMS | Short single-line RFQ (each 160 chars is billed) | Short PO line, "reply YES to confirm" |

### 4.2 Inbound: reply → quote

```mermaid
flowchart TD
    R["Reply arrives<br/>(IMAP poll / WhatsApp webhook / SMS webhook)"] --> S{Signature valid?<br/>webhooks only}
    S -- no --> X[401, ignored]
    S -- yes --> D{Already seen this<br/>provider message id?}
    D -- yes --> Z[Ignore retry]
    D -- no --> L[Log as INBOUND]
    L --> V{Sender matches a<br/>vendor contact?}
    V -- no --> U1[UNMATCHED: not a vendor]
    V -- yes --> O{Open RFQ sent to this vendor<br/>on THIS channel?}
    O -- no --> U2[UNMATCHED: wrong channel / no open RFQ]
    O -- yes --> REF{RFQ reference<br/>in subject/text?}
    REF -- yes --> T[That RFQ]
    REF -- no --> P["pickRfq() policy<br/>(currently: newest)"]
    P --> T
    T --> PR{Price found by parser?}
    PR -- no, attachment --> A1[Mark read; staff use 'Log reply']
    PR -- no, text --> A2[Mark read; ask vendor to resend]
    PR -- yes --> Q[Create quote → RFQ REPLIED]
    Q --> ACK[Send acknowledgement on same channel]
    Q --> CMP[Comparison recomputes L1]
```

### 4.3 Delivery receipts

WhatsApp (`statuses`: delivered / read / failed) and SMSGate (`sms:delivered` / `sms:failed`) send receipts with
the provider message id. `MessagingService.updateStatus` updates the log (never moves backwards: read stays
read), and `ProcurementService.applyDeliveryReceipt` moves the RFQ along `SENT → DELIVERED → READ`.

### 4.4 Endpoints

| Endpoint | Caller | Purpose |
|---|---|---|
| `GET /api/channels` | Frontend | Live/mock per channel, allowlist |
| `POST /api/channels/test` | Frontend | Send a test message to a typed recipient |
| `POST /api/channels/simulate-inbound` | Frontend | Feed a reply as if from a provider (testing) |
| `GET /api/webhooks/whatsapp` | Meta | One-time verify handshake |
| `POST /api/webhooks/whatsapp` | Meta | Replies + status ticks, `X-Hub-Signature-256` checked |
| `POST /api/webhooks/sms` | SMSGate | `sms:received/delivered/failed`, `X-Signature` + `X-Timestamp` checked (±5 min) |
| `GET /api/outbox` | Frontend | Message log (both directions) |

---

## 5. Data model (core)

```mermaid
erDiagram
    VENDOR ||--o{ CONTACT_PERSON : has
    VENDOR }o--o{ CATEGORY : supplies
    PURCHASE_REQUEST ||--|{ PR_LINE : contains
    PURCHASE_REQUEST ||--o{ RFQ : "sent as (per vendor, per round)"
    VENDOR ||--o{ RFQ : receives
    RFQ ||--o{ QUOTE : "answered by (versions)"
    PURCHASE_REQUEST ||--o{ APPROVAL : records
    PURCHASE_REQUEST ||--o| PURCHASE_ORDER : results_in
    PURCHASE_ORDER ||--o{ GOODS_RECEIPT : received_by
    RFQ ||--o{ MESSAGE_LOG : "messages about"
    VENDOR ||--o{ MESSAGE_LOG : "to / from"

    CONTACT_PERSON {
        string email
        string whatsapp
        string phone
        enum preferredChannel
    }
    RFQ {
        string reference
        int round
        enum channel "one, from preference"
        enum status
        string providerMessageId
        string deliveryError
    }
    QUOTE {
        decimal unitPrice
        decimal taxPercent
        decimal deliveryCharge
        int deliveryDays
        enum source "EMAIL_TEXT, WHATSAPP_TEXT, SMS_TEXT, PDF, IMAGE, VOICE, PORTAL, MANUAL"
        double parseConfidence
        decimal landedCost "derived, used for L1"
    }
    MESSAGE_LOG {
        enum direction "OUTBOUND / INBOUND"
        enum channel
        enum status "SENT DELIVERED READ FAILED MOCK BLOCKED RECEIVED UNMATCHED"
        string providerMessageId
        string error
    }
```

**L1** = lowest landed cost = `unitPrice × qty + GST + delivery charge`, over the latest quote version per vendor
in the current round.

---

## 6. Business rules enforced in the backend

- Only `ACTIVE` vendors get RFQs; a vendor with no reachable address is refused at send time.
- One channel per RFQ; replies count only on that channel.
- Fewer than 3 quotes, or choosing a non-L1 quote, needs a written justification.
- Low-confidence parsed quotes must be verified by the manager before they can be selected.
- Above ₹10,000 or over budget → official (second-level) approval.
- Auto-reminder sweep every 10 min: 24 h interval, max 3, then No Response after the deadline.
- Live sends only to the allowlist until `MESSAGING_ALLOW_ALL=true`.

---

## 7. Configuration (next step)

All provider settings are read from environment variables or the git-ignored `backend/.env`
(template: `backend/.env.example`). Any channel left blank runs in mock mode, so the whole flow works without credentials.

| Order | Step | Needs |
|---|---|---|
| 1 | Email live | Gmail address, App Password, `MESSAGING_ALLOWED_RECIPIENTS` |
| 2 | WhatsApp live | Meta app, phone number id, token, approved `rfq_request` template, public URL (ngrok) for the webhook |
| 3 | SMS live | Android phone with SMSGate, send URL + credentials, webhook registration, signing key |
| 4 | Persistence | Supabase Postgres tables mirroring `model/` (incl. `messages`), JPA repositories |
| 5 | Auth | Supabase Auth replaces the "Acting as" switcher and portal mock sign-in |
| 6 | Hosting | Backend on a public HTTPS host so webhooks no longer need ngrok |

Open design decision: `InboundReplyService.pickRfq()`, which RFQ an unreferenced reply belongs to when a vendor
has several open RFQs on the same channel (currently: the newest).
