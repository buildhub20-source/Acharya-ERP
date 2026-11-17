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
import type { Category, OutboxMessage, Vendor } from "@/lib/types";

type Action = { key: string; label: string; style: string; needsReason: boolean };

const ACTIONS: Record<string, Action[]> = {
  PENDING_VERIFICATION: [
    { key: "APPROVE", label: "Approve vendor", style: "btn-success", needsReason: false },
    { key: "SEND_BACK", label: "Send back", style: "btn-secondary", needsReason: true },
    { key: "REJECT", label: "Reject", style: "btn-danger", needsReason: true },
  ],
  REGISTERED: [{ key: "APPROVE", label: "Approve vendor", style: "btn-success", needsReason: false }],
  INVITED: [{ key: "SUBMIT", label: "Mark profile submitted", style: "btn-secondary", needsReason: false }],
  SENT_BACK: [{ key: "SUBMIT", label: "Mark resubmitted", style: "btn-secondary", needsReason: false }],
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

const TABS = ["Overview", "Documents", "Performance", "Messages", "Audit log"] as const;

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
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>{label(v.status)}:</b> {v.statusReason}
        </div>
      )}
      {v.pendingBankChange && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
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

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ${tab === t ? "border-indigo-600 font-medium text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
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
                <dt className="text-xs text-slate-500">Categories</dt>
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
              <thead className="bg-slate-50"><tr><th className="th">Name</th><th className="th">Phone / WhatsApp</th><th className="th">Email</th><th className="th">Preferred</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {v.contacts.map((c, i) => (
                  <tr key={i}>
                    <td className="td"><div className="font-medium">{c.name}</div><div className="text-xs text-slate-500">{c.role}</div></td>
                    <td className="td">{c.phone} {c.phoneVerified && <span className="text-emerald-600" title="OTP verified">✓</span>}</td>
                    <td className="td">{c.email || "—"} {c.emailVerified && <span className="text-emerald-600" title="Verified">✓</span>}</td>
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

      {tab === "Documents" && (
        <Card title="Compliance documents" bodyClass="p-0"
          actions={<button className="btn-secondary text-xs" onClick={() => setDocOpen(true)}>+ Upload / renew</button>}>
          {v.documents.length === 0 ? <Empty>No documents uploaded.</Empty> : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-slate-50"><tr><th className="th">Document</th><th className="th">Number</th><th className="th">Expiry</th><th className="th">Verification</th><th className="th" /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {v.documents.map((d) => (
                    <tr key={d.id}>
                      <td className="td"><div className="font-medium">{label(d.type)}</div><div className="text-xs text-slate-500">{d.fileName}</div></td>
                      <td className="td font-mono text-xs">{d.number || "—"}</td>
                      <td className="td">
                        {d.expiryDate ? (
                          <span className={d.expired ? "text-rose-600" : d.daysToExpiry! <= 30 ? "text-amber-600" : ""}>
                            {date(d.expiryDate)} {d.expired ? "(expired)" : d.daysToExpiry! <= 30 ? `(${d.daysToExpiry}d left)` : ""}
                          </span>
                        ) : "No expiry"}
                      </td>
                      <td className="td"><StatusBadge status={d.verification} /></td>
                      <td className="td text-right">
                        {d.verification === "PENDING" && (
                          <span className="flex justify-end gap-2">
                            <button className="text-xs text-emerald-700 hover:underline" onClick={() => verifyDoc(d.id, true)}>Verify</button>
                            <button className="text-xs text-rose-600 hover:underline" onClick={() => verifyDoc(d.id, false)}>Reject</button>
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
            <div className="text-5xl font-semibold tabular-nums text-indigo-600">{p.overallScore.toFixed(0)}<span className="text-lg text-slate-400">/100</span></div>
            <div className="mt-2"><Stars value={p.manualRating} /></div>
            <p className="mt-3 text-xs text-slate-500">20% response rate · 30% on-time delivery · 30% quality acceptance · 20% manager rating. Used to rank vendors when sending RFQs.</p>
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
            <ul className="divide-y divide-slate-100">
              {messages.map((m, i) => (
                <li key={i} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><ChannelChip channel={m.channel} /><span className="font-medium">{m.subject}</span><span className="ml-auto text-xs text-slate-400">{dateTime(m.at)}</span></div>
                  <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-slate-500">{m.body}</pre>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "Audit log" && (
        <Card bodyClass="p-0">
          <ul className="divide-y divide-slate-100">
            {v.audit.map((a, i) => (
              <li key={i} className="flex gap-4 px-5 py-3 text-sm">
                <span className="w-32 shrink-0 text-xs text-slate-400">{dateTime(a.at)}</span>
                <span className="min-w-0"><b className="font-medium">{label(a.action)}</b> — {a.details} <span className="text-slate-400">· {a.by}</span></span>
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
        {pending?.key === "BLACKLIST" && <p className="mt-3 text-xs text-rose-700">Blacklisting stops all RFQs and orders. History is kept for audit.</p>}
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
        <p className="mt-3 text-xs text-slate-500">File storage will move to Supabase Storage; for now only the metadata is saved.</p>
      </Modal>

      <Modal open={rateOpen} title={`Rate ${v.displayName}`} onClose={() => setRateOpen(false)}
        footer={<><button className="btn-secondary" onClick={() => setRateOpen(false)}>Cancel</button><button className="btn-primary" disabled={act.busy} onClick={rate}>Save rating</button></>}>
        <div className="flex gap-2 text-3xl">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setRating(n)} className={n <= rating ? "text-amber-500" : "text-slate-300"} aria-label={`${n} stars`}>★</button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Blended into the running average (70% previous, 30% this rating).</p>
      </Modal>
    </>
  );
}

function Info({ k, v, mono, className = "" }: { k: string; v: React.ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-slate-500">{k}</dt>
      <dd className={`mt-0.5 text-slate-800 ${mono ? "font-mono text-[13px]" : ""}`}>{v ?? "—"}</dd>
    </div>
  );
}

function Metric({ k, v, bar }: { k: string; v: React.ReactNode; bar?: number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{k}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-slate-800">{v}</div>
      {bar !== undefined && <div className="mt-1"><ScoreBar value={bar} /></div>}
    </div>
  );
}
