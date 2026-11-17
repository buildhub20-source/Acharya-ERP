"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Badge, Card, ChannelChip, Empty, ErrorBox, Field, Loading, Modal, PageHeader, ScoreBar, Stars, StatusBadge,
} from "@/components/ui";
import { useUser } from "@/components/UserContext";
import { api } from "@/lib/api";
import { date, dateTime, label, terms } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import type { Category, InviteLink, OutboxMessage, Vendor } from "@/lib/types";
import ActivityTab from "@/components/vendors/ActivityTab";
import CatalogueTab from "@/components/vendors/CatalogueTab";

type Action = { key: string; label: string; style: string; needsReason: boolean };

const ACTIONS: Record<string, Action[]> = {
  PENDING_VERIFICATION: [
    { key: "APPROVE", label: "Approve vendor", style: "btn-success", needsReason: false },
    { key: "SEND_BACK", label: "Send back", style: "btn-secondary", needsReason: true },
    { key: "REJECT", label: "Reject", style: "btn-danger", needsReason: true },
  ],
  ACTIVE: [
    { key: "SUSPEND", label: "Suspend", style: "btn-secondary", needsReason: true },
    { key: "DEACTIVATE", label: "Deactivate", style: "btn-secondary", needsReason: false },
    { key: "BLACKLIST", label: "Blacklist", style: "btn-danger", needsReason: true },
  ],
  SUSPENDED: [
    { key: "REACTIVATE", label: "Reactivate", style: "btn-success", needsReason: false },
    { key: "BLACKLIST", label: "Blacklist", style: "btn-danger", needsReason: true },
  ],
  INACTIVE: [{ key: "REACTIVATE", label: "Reactivate", style: "btn-success", needsReason: false }],
};

const TABS = ["Overview", "Catalogue", "Activity", "Documents", "Performance", "Messages", "Audit log"] as const;

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const { data: v, error, setData } = useApi<Vendor>(`/vendors/${id}`);
  const { data: categories } = useApi<Category[]>("/categories");
  const { data: messages } = useApi<OutboxMessage[]>(`/outbox?vendorId=${id}`);
  const act = useAction();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [pending, setPending] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [docOpen, setDocOpen] = useState(false);
  const [doc, setDoc] = useState({ type: "TRADE_LICENCE", number: "", issueDate: "", expiryDate: "" });
  const [rateOpen, setRateOpen] = useState(false);
  const [rating, setRating] = useState(4);
  const [invite, setInvite] = useState<InviteLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [legal, setLegal] = useState<{ legalName: string; gstin: string; pan: string; reason: string } | null>(null);
  const catName = useMemo(() => Object.fromEntries((categories ?? []).map((c) => [c.id, c.name])), [categories]);

  if (error) return <ErrorBox message={error} />;
  if (!v) return <Loading />;

  const doAction = async (a: Action) => {
    if (a.needsReason && !reason.trim()) return act.setError("Please enter a reason");
    const res = await act.run(() => api.post<Vendor>(`/vendors/${v.id}/status`, { action: a.key, reason, actor: user.name }));
    if (res) { setData(res); setPending(null); setReason(""); }
  };
  const bankDecision = async (approve: boolean) => {
    const res = await act.run(() => api.post<Vendor>(`/vendors/${v.id}/bank-change/${approve ? "approve" : "reject"}`, { actor: user.name }));
    if (res) setData(res);
  };
  const verifyDoc = async (docId: string, ok: boolean) => {
    const res = await act.run(() => api.post<Vendor>(`/vendors/${v.id}/documents/${docId}/verify?ok=${ok}`, { actor: user.name }));
    if (res) setData(res);
  };
  const uploadDoc = async () => {
    const res = await act.run(() => api.post<Vendor>(`/vendors/${v.id}/documents`, {
      ...doc, issueDate: doc.issueDate || null, expiryDate: doc.expiryDate || null,
    }));
    if (res) { setData(res); setDocOpen(false); }
  };
  const rate = async () => {
    const res = await act.run(() => api.post<Vendor>(`/vendors/${v.id}/rating`, { rating, actor: user.name }));
    if (res) { setData(res); setRateOpen(false); }
  };

  const sendInvite = async () => {
    const res = await act.run(() => api.post<InviteLink>(`/vendors/${v.id}/invite`));
    if (res) { setInvite(res); setCopied(false); }
  };
  const requestLegal = async () => {
    if (!legal) return;
    const res = await act.run(() => api.post<Vendor>(`/vendors/${v.id}/identity-change`, {
      ...legal, gstin: legal.gstin.trim().toUpperCase(), pan: legal.pan.trim().toUpperCase(), actor: user.name,
    }));
    if (res) { setData(res); setLegal(null); }
  };
  const legalDecision = async (approve: boolean) => {
    const res = await act.run(() => api.post<Vendor>(`/vendors/${v.id}/identity-change/${approve ? "approve" : "reject"}`, { actor: user.name }));
    if (res) setData(res);
  };
  const identityLocked = ["ACTIVE", "SUSPENDED", "INACTIVE"].includes(v.status);

  const p = v.performance;

  return (
    <>
      <PageHeader
        back={{ href: "/vendors", label: "Vendors" }}
        title={<span className="flex flex-wrap items-center gap-3">{v.displayName} <StatusBadge status={v.status} /></span>}
        subtitle={<>{v.code} · {v.legalName} · {label(v.type)} · {v.city}</>}
        actions={
          <>
            <Link href={`/vendors/${v.id}/edit`} className="btn-secondary">Edit</Link>
            {identityLocked && !v.pendingIdentityChange && (
              <button className="btn-secondary" onClick={() => setLegal({ legalName: v.legalName, gstin: v.gstin ?? "", pan: v.pan ?? "", reason: "" })}>Request legal change</button>
            )}
            {v.onboardingOpen && (
              <button className="btn-primary" disabled={act.busy} onClick={sendInvite}>{v.inviteSentAt ? "Resend onboarding link" : "Send onboarding link"}</button>
            )}
            {(ACTIONS[v.status] ?? []).map((a) => (
              <button key={a.key} className={a.style} disabled={act.busy}
                onClick={() => (a.needsReason || a.key === "BLACKLIST" ? setPending(a) : doAction(a))}>
                {a.label}
              </button>
            ))}
          </>
        }
      />
      <ErrorBox message={act.error} onClose={() => act.setError(null)} />

      {v.statusReason && v.status !== "ACTIVE" && (
        <div className="mb-4 rounded-lg border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
          <b>{label(v.status)}:</b> {v.statusReason}
        </div>
      )}
      {v.onboardingOpen && (
        <div className="mb-4 rounded-lg border border-info/30 bg-info/10 px-4 py-3 text-sm text-info">
          <b>Onboarding in progress.</b> The vendor completes the profile, verifies a contact by OTP and uploads GST / PAN documents through
          their onboarding link, then submits it for your verification.
          {v.inviteSentAt && <span className="text-ink-mute"> Last link sent {dateTime(v.inviteSentAt)}.</span>}
        </div>
      )}
      {v.pendingIdentityChange && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
          <div>
            <b>Legal change awaiting re-verification</b>: {v.legalName}{v.gstin ? ` / ${v.gstin}` : ""} → {v.pendingIdentityChange.legalName}
            {v.pendingIdentityChange.gstin ? ` / ${v.pendingIdentityChange.gstin}` : ""}
            {v.pendingIdentityChange.pan !== v.pan ? ` · PAN ${v.pendingIdentityChange.pan ?? "—"}` : ""}
            <div className="text-xs text-ink-mute">Reason: {v.pendingIdentityChange.reason} · requested by {v.pendingIdentityChange.requestedBy}, {dateTime(v.pendingIdentityChange.requestedAt)}</div>
          </div>
          {user.role !== "MANAGER" ? (
            <div className="flex gap-2">
              <button className="btn-success" disabled={act.busy} onClick={() => legalDecision(true)}>Approve change</button>
              <button className="btn-secondary" disabled={act.busy} onClick={() => legalDecision(false)}>Reject</button>
            </div>
          ) : <span className="text-xs">Principal / Admin must approve</span>}
        </div>
      )}
      {v.pendingBankChange && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <div>
            <b>Bank change awaiting approval</b>: {v.bank?.maskedAccountNumber} → {v.pendingBankChange.maskedAccountNumber} (
            {v.pendingBankChange.bankName}, {v.pendingBankChange.ifsc}). Payments are on hold until this is verified.
          </div>
          {user.role !== "MANAGER" ? (
            <div className="flex gap-2">
              <button className="btn-success" disabled={act.busy} onClick={() => bankDecision(true)}>Approve change</button>
              <button className="btn-secondary" disabled={act.busy} onClick={() => bankDecision(false)}>Reject</button>
            </div>
          ) : <span className="text-xs">Principal / Admin must approve</span>}
        </div>
      )}

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-rule">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ${tab === t ? "border-poster font-medium text-poster" : "border-transparent text-ink-mute hover:text-ink-soft"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Business & tax" className="lg:col-span-2">
            <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              <Info k="Legal name" v={v.legalName} />
              <Info k="Trade name" v={v.tradeName} />
              <Info k="GSTIN" v={v.gstin} mono />
              <Info k="PAN" v={v.pan} mono />
              <Info k="MSME / Udyam" v={v.msmeNumber} />
              <Info k="Established" v={v.yearEstablished} />
              <Info k="Address" v={v.registeredAddress} className="sm:col-span-2" />
              <div className="sm:col-span-2">
                <dt className="text-xs text-ink-mute">Categories</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {v.categoryIds.map((c) => <Badge key={c} tone="indigo">{catName[c] ?? c}</Badge>)}
                </dd>
              </div>
            </dl>
          </Card>
          <Card title="Commercial">
            <dl className="space-y-3 text-sm">
              <Info k="Payment terms" v={terms(v.paymentTerms)} />
              <Info k="Lead time" v={v.leadTimeDays ? `${v.leadTimeDays} days` : null} />
              <Info k="Minimum order" v={v.minOrderValue ? `₹${v.minOrderValue.toLocaleString("en-IN")}` : null} />
              <Info k="Receives RFQs" v={v.rfqEligible ? "Yes" : "No — vendor is not active"} />
              <Info k="Vendor portal" v={v.portalEnabled ? `Enabled · last login ${dateTime(v.lastPortalLogin)}` : "Disabled"} />
            </dl>
          </Card>
          <Card title="Contacts" className="lg:col-span-2" bodyClass="p-0">
            <table className="min-w-full">
              <thead className="bg-raised"><tr><th className="th">Name</th><th className="th">Phone / WhatsApp</th><th className="th">Email</th><th className="th">Preferred</th></tr></thead>
              <tbody className="divide-y divide-rule">
                {v.contacts.map((c, i) => (
                  <tr key={i}>
                    <td className="td"><div className="font-medium">{c.name}</div><div className="text-xs text-ink-mute">{c.role}</div></td>
                    <td className="td">{c.phone} {c.phoneVerified && <span className="text-ok" title="OTP verified">✓</span>}</td>
                    <td className="td">{c.email || "—"} {c.emailVerified && <span className="text-ok" title="Verified">✓</span>}</td>
                    <td className="td"><ChannelChip channel={c.preferredChannel} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card title="Bank">
            {v.bank ? (
              <dl className="space-y-3 text-sm">
                <Info k="Account" v={`${v.bank.maskedAccountNumber} ${v.bank.verified ? "✓ verified" : "(unverified)"}`} mono />
                <Info k="Name" v={v.bank.accountName} />
                <Info k="Bank / IFSC" v={`${v.bank.bankName} · ${v.bank.ifsc}`} />
              </dl>
            ) : <Empty>No bank details yet</Empty>}
          </Card>
        </div>
      )}

      {tab === "Catalogue" && <CatalogueTab vendor={v} categories={categories ?? []} onChange={setData} />}

      {tab === "Activity" && <ActivityTab vendorId={v.id} />}

      {tab === "Documents" && (
        <Card title="Compliance documents" bodyClass="p-0"
          actions={<button className="btn-secondary text-xs" onClick={() => setDocOpen(true)}>+ Upload / renew</button>}>
          {v.documents.length === 0 ? <Empty>No documents uploaded.</Empty> : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-raised"><tr><th className="th">Document</th><th className="th">Number</th><th className="th">Expiry</th><th className="th">Verification</th><th className="th" /></tr></thead>
                <tbody className="divide-y divide-rule">
                  {v.documents.map((d) => (
                    <tr key={d.id}>
                      <td className="td"><div className="font-medium">{label(d.type)}</div><div className="text-xs text-ink-mute">{d.fileName}</div></td>
                      <td className="td font-mono text-xs">{d.number || "—"}</td>
                      <td className="td">
                        {d.expiryDate ? (
                          <span className={d.expired ? "text-danger" : d.daysToExpiry! <= 30 ? "text-warn" : ""}>
                            {date(d.expiryDate)} {d.expired ? "(expired)" : d.daysToExpiry! <= 30 ? `(${d.daysToExpiry}d left)` : ""}
                          </span>
                        ) : "No expiry"}
                      </td>
                      <td className="td"><StatusBadge status={d.verification} /></td>
                      <td className="td text-right">
                        {d.verification === "PENDING" && (
                          <span className="flex justify-end gap-2">
                            <button className="text-xs text-ok hover:underline" onClick={() => verifyDoc(d.id, true)}>Verify</button>
                            <button className="text-xs text-danger hover:underline" onClick={() => verifyDoc(d.id, false)}>Reject</button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "Performance" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Overall score" actions={<button className="btn-secondary text-xs" onClick={() => setRateOpen(true)}>Rate vendor</button>}>
            <div className="text-5xl font-semibold tabular-nums text-poster">{p.overallScore.toFixed(0)}<span className="text-lg text-ink-mute">/100</span></div>
            <div className="mt-2"><Stars value={p.manualRating} /></div>
            <p className="mt-3 text-xs text-ink-mute">20% response rate · 30% on-time delivery · 30% quality acceptance · 20% manager rating. Used to rank vendors when sending RFQs.</p>
          </Card>
          <Card title="Metrics" className="lg:col-span-2">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Metric k="RFQs received" v={p.rfqsReceived} />
              <Metric k="Responded" v={`${p.rfqsResponded} (${p.responseRatePct}%)`} />
              <Metric k="Avg response time" v={`${p.avgResponseHours} h`} />
              <Metric k="Quotes won" v={p.quotesWon} />
              <Metric k="On-time delivery" v={`${p.onTimeDeliveryPct}%`} bar={p.onTimeDeliveryPct} />
              <Metric k="Quality acceptance" v={`${p.qualityAcceptancePct}%`} bar={p.qualityAcceptancePct} />
            </div>
          </Card>
        </div>
      )}

      {tab === "Messages" && (
        <Card title="Messages sent to this vendor (mock outbox)" bodyClass="p-0">
          {!messages?.length ? <Empty>No messages yet.</Empty> : (
            <ul className="divide-y divide-rule">
              {messages.map((m, i) => (
                <li key={i} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><ChannelChip channel={m.channel} /><span className="font-medium">{m.subject}</span><span className="ml-auto text-xs text-ink-mute">{dateTime(m.at)}</span></div>
                  <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-ink-mute">{m.body}</pre>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "Audit log" && (
        <Card bodyClass="p-0">
          <ul className="divide-y divide-rule">
            {v.audit.map((a, i) => (
              <li key={i} className="flex gap-4 px-5 py-3 text-sm">
                <span className="w-32 shrink-0 text-xs text-ink-mute">{dateTime(a.at)}</span>
                <span className="min-w-0"><b className="font-medium">{label(a.action)}</b> — {a.details} <span className="text-ink-mute">· {a.by}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal open={!!pending} title={pending?.label ?? ""} onClose={() => setPending(null)}
        footer={<>
          <button className="btn-secondary" onClick={() => setPending(null)}>Cancel</button>
          <button className={pending?.style ?? "btn-primary"} disabled={act.busy} onClick={() => pending && doAction(pending)}>Confirm</button>
        </>}>
        <Field label="Reason (recorded in audit log)">
          <textarea className="input min-h-24" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {pending?.key === "BLACKLIST" && <p className="mt-3 text-xs text-danger">Blacklisting stops all RFQs and orders. History is kept for audit.</p>}
      </Modal>

      <Modal open={docOpen} title="Upload / renew document" onClose={() => setDocOpen(false)}
        footer={<><button className="btn-secondary" onClick={() => setDocOpen(false)}>Cancel</button><button className="btn-primary" disabled={act.busy} onClick={uploadDoc}>Upload</button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <select className="input" value={doc.type} onChange={(e) => setDoc({ ...doc, type: e.target.value })}>
              {["GST_CERT", "PAN", "TRADE_LICENCE", "FSSAI", "MSME", "INSURANCE", "CANCELLED_CHEQUE"].map((t) => <option key={t} value={t}>{label(t)}</option>)}
            </select>
          </Field>
          <Field label="Number"><input className="input" value={doc.number} onChange={(e) => setDoc({ ...doc, number: e.target.value })} /></Field>
          <Field label="Issue date"><input className="input" type="date" value={doc.issueDate} onChange={(e) => setDoc({ ...doc, issueDate: e.target.value })} /></Field>
          <Field label="Expiry date"><input className="input" type="date" value={doc.expiryDate} onChange={(e) => setDoc({ ...doc, expiryDate: e.target.value })} /></Field>
        </div>
        <p className="mt-3 text-xs text-ink-mute">File storage will move to Supabase Storage; for now only the metadata is saved.</p>
      </Modal>

      <Modal open={!!invite} title="Onboarding link sent" onClose={() => setInvite(null)}
        footer={<button className="btn-primary" onClick={() => setInvite(null)}>Done</button>}>
        {invite && (
          <div className="space-y-3 text-sm text-ink-soft">
            <p>Sent by email and WhatsApp to <b className="text-ink">{invite.sentTo}</b>. The link is personal to this vendor; share it only with them.</p>
            <div className="flex gap-2">
              <input className="input font-mono text-xs" readOnly value={invite.link} onFocus={(e) => e.target.select()} />
              <button className="btn-secondary" onClick={async () => { try { await navigator.clipboard.writeText(invite.link); setCopied(true); } catch { /* clipboard blocked */ } }}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <a className="text-xs text-poster hover:underline" href={invite.link} target="_blank" rel="noreferrer">Open as the vendor (demo) ↗</a>
          </div>
        )}
      </Modal>

      <Modal open={!!legal} title="Request legal change" onClose={() => setLegal(null)}
        footer={<><button className="btn-secondary" onClick={() => setLegal(null)}>Cancel</button>
          <button className="btn-primary" disabled={act.busy || !legal?.reason.trim() || !legal?.legalName.trim()} onClick={requestLegal}>Send for approval</button></>}>
        {legal && (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">Legal name, GSTIN and PAN are locked on approved vendors. A change is applied only after a Principal or Admin approves it; a new GSTIN or PAN also needs its certificate re-verified.</p>
            <Field label="Legal name *"><input className="input" value={legal.legalName} onChange={(e) => setLegal({ ...legal, legalName: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="GSTIN"><input className="input uppercase" maxLength={15} value={legal.gstin} onChange={(e) => setLegal({ ...legal, gstin: e.target.value })} /></Field>
              <Field label="PAN"><input className="input uppercase" maxLength={10} value={legal.pan} onChange={(e) => setLegal({ ...legal, pan: e.target.value })} /></Field>
            </div>
            <Field label="Reason *" hint="e.g. firm converted to LLP, new GST registration after relocation">
              <textarea className="input min-h-20" value={legal.reason} onChange={(e) => setLegal({ ...legal, reason: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal open={rateOpen} title={`Rate ${v.displayName}`} onClose={() => setRateOpen(false)}
        footer={<><button className="btn-secondary" onClick={() => setRateOpen(false)}>Cancel</button><button className="btn-primary" disabled={act.busy} onClick={rate}>Save rating</button></>}>
        <div className="flex gap-2 text-3xl">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setRating(n)} className={n <= rating ? "text-poster" : "text-ink-faint"} aria-label={`${n} stars`}>★</button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-mute">Blended into the running average (70% previous, 30% this rating).</p>
      </Modal>
    </>
  );
}

function Info({ k, v, mono, className = "" }: { k: string; v: React.ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-ink-mute">{k}</dt>
      <dd className={`mt-0.5 text-ink ${mono ? "font-mono text-[13px]" : ""}`}>{v ?? "—"}</dd>
    </div>
  );
}

function Metric({ k, v, bar }: { k: string; v: React.ReactNode; bar?: number }) {
  return (
    <div className="rounded-lg bg-raised p-3">
      <div className="text-xs text-ink-mute">{k}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-ink">{v}</div>
      {bar !== undefined && <div className="mt-1"><ScoreBar value={bar} /></div>}
    </div>
  );
}
