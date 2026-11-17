"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Card, ChannelChip, Empty, ErrorBox, Field, Loading, Modal, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { date, dateTime, label, money, terms } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import type { OutboxMessage, PortalRfq, PurchaseOrder, Vendor } from "@/lib/types";

const TABS = ["RFQs", "Orders", "Documents", "Messages"] as const;

export default function VendorPortal() {
  const { vendorId } = useParams<{ vendorId: string }>();
  const { data: vendor, error, setData: setVendor } = useApi<Vendor>(`/portal/vendors/${vendorId}`);
  const { data: rfqs, reload: reloadRfqs } = useApi<PortalRfq[]>(`/portal/vendors/${vendorId}/rfqs`);
  const { data: orders, reload: reloadOrders } = useApi<PurchaseOrder[]>(`/portal/vendors/${vendorId}/orders`);
  const { data: messages } = useApi<OutboxMessage[]>(`/portal/vendors/${vendorId}/messages`);
  const [tab, setTab] = useState<(typeof TABS)[number]>("RFQs");
  const [quoting, setQuoting] = useState<PortalRfq | null>(null);
  const [q, setQ] = useState({ unitPrice: "", taxPercent: "12", deliveryCharge: "0", deliveryDays: "7", validityDays: "30", paymentTerms: "NET_30", remarks: "", meetsSpecs: true, specDeviation: "" });
  const [docOpen, setDocOpen] = useState(false);
  const [doc, setDoc] = useState({ type: "TRADE_LICENCE", number: "", expiryDate: "" });
  const act = useAction();

  if (error) return <div className="p-8"><ErrorBox message={error} /></div>;
  if (!vendor) return <Loading />;

  const openQuote = async (r: PortalRfq) => {
    setQuoting(r);
    const m = r.myQuote;
    setQ(m ? {
      unitPrice: String(m.unitPrice), taxPercent: String(m.taxPercent), deliveryCharge: String(m.deliveryCharge), deliveryDays: String(m.deliveryDays),
      validityDays: String(m.validityDays), paymentTerms: m.paymentTerms ?? "NET_30", remarks: m.remarks ?? "", meetsSpecs: m.meetsSpecs, specDeviation: m.specDeviation ?? "",
    } : { ...q, unitPrice: "", paymentTerms: vendor.paymentTerms ?? "NET_30", deliveryDays: String(vendor.leadTimeDays ?? 7) });
    await api.post(`/portal/vendors/${vendorId}/rfqs/${r.rfq.id}/read`).catch(() => {});
  };
  const qty = quoting?.lines.reduce((s, l) => s + l.quantity, 0) ?? 0;
  const sub = Number(q.unitPrice || 0) * qty;
  const total = sub + (sub * Number(q.taxPercent || 0)) / 100 + Number(q.deliveryCharge || 0);

  const submit = async () => {
    if (!quoting) return;
    const ok = await act.run(() => api.post(`/portal/vendors/${vendorId}/rfqs/${quoting.rfq.id}/quote`, {
      rfqId: quoting.rfq.id, unitPrice: Number(q.unitPrice), taxPercent: Number(q.taxPercent), deliveryCharge: Number(q.deliveryCharge),
      deliveryDays: Number(q.deliveryDays), validityDays: Number(q.validityDays), paymentTerms: q.paymentTerms, remarks: q.remarks,
      meetsSpecs: q.meetsSpecs, specDeviation: q.meetsSpecs ? null : q.specDeviation,
    }));
    if (ok) { setQuoting(null); reloadRfqs(); }
  };
  const orderAction = async (po: PurchaseOrder, action: "accept" | "dispatch") => {
    if (await act.run(() => api.post(`/portal/vendors/${vendorId}/orders/${po.id}/${action}`))) reloadOrders();
  };
  const uploadDoc = async () => {
    const res = await act.run(() => api.post<Vendor>(`/portal/vendors/${vendorId}/documents`, { ...doc, expiryDate: doc.expiryDate || null }));
    if (res) { setVendor(res); setDocOpen(false); }
  };

  const openCount = rfqs?.filter((r) => r.open).length ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-600 text-sm font-bold text-white">G</div>
            <div>
              <div className="text-sm font-semibold">Greenfield Vendor Portal</div>
              <div className="text-xs text-slate-500">{vendor.displayName} · {vendor.code}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={vendor.status} />
            <Link href="/portal" className="btn-ghost text-xs">Sign out</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <ErrorBox message={act.error} onClose={() => act.setError(null)} />
        {vendor.status === "SUSPENDED" && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            Your account is suspended: {vendor.statusReason}. Upload a renewed document under <b>Documents</b> to resume receiving RFQs.
          </div>
        )}
        {vendor.pendingBankChange && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Your bank change to {vendor.pendingBankChange.maskedAccountNumber} is being verified by the school. Payments are on hold until then.
          </div>
        )}

        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MiniStat k="Open RFQs" v={openCount} />
          <MiniStat k="Orders" v={orders?.length ?? 0} />
          <MiniStat k="Win count" v={vendor.performance.quotesWon} />
          <MiniStat k="Response rate" v={`${vendor.performance.responseRatePct}%`} />
        </div>

        <div className="mb-5 flex gap-1 border-b border-slate-200">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`border-b-2 px-4 py-2.5 text-sm ${tab === t ? "border-emerald-600 font-medium text-emerald-700" : "border-transparent text-slate-500"}`}>
              {t}{t === "RFQs" && openCount > 0 && <span className="ml-1.5 rounded-full bg-emerald-600 px-1.5 text-[10px] text-white">{openCount}</span>}
            </button>
          ))}
        </div>

        {tab === "RFQs" && (
          <div className="space-y-4">
            {!rfqs ? <Loading /> : rfqs.length === 0 ? <Card><Empty>No RFQs yet.</Empty></Card> : rfqs.map((r) => (
              <Card key={r.rfq.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2"><span className="font-semibold text-slate-900">{r.title}</span><StatusBadge status={r.outcome} /></div>
                    <div className="mt-0.5 text-xs text-slate-500">{r.rfq.reference} · deliver by {date(r.dueDate)} to {r.deliveryLocation} · reply by {dateTime(r.quoteDeadline)}</div>
                    <ul className="mt-2 text-sm text-slate-700">
                      {r.lines.map((l, i) => <li key={i}>• {l.description} — <b>{l.quantity} {l.unit}</b>{l.specs && <span className="text-slate-500"> ({l.specs})</span>}</li>)}
                    </ul>
                    {r.myQuote && (
                      <div className="mt-2 text-xs text-slate-600">
                        Your quote (v{r.myQuote.version}): {money(r.myQuote.unitPrice)}/unit · total {money(r.myQuote.landedCost)} · {r.myQuote.deliveryDays} days
                      </div>
                    )}
                  </div>
                  {r.open && (
                    <button className="btn-success" disabled={vendor.status !== "ACTIVE"} onClick={() => openQuote(r)}>{r.myQuote ? "Revise quote" : "Submit quote"}</button>
                  )}
                </div>
              </Card>
            ))}
            <p className="text-xs text-slate-400">Sealed bid: you only see your own quotes. The school compares landed cost (price + GST + delivery), delivery time and vendor rating.</p>
          </div>
        )}

        {tab === "Orders" && (
          <Card bodyClass="p-0">
            {!orders?.length ? <Empty>No purchase orders yet.</Empty> : (
              <table className="min-w-full">
                <thead className="bg-slate-50"><tr><th className="th">PO</th><th className="th text-right">Amount</th><th className="th">Deliver by</th><th className="th">Status</th><th className="th" /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="td"><div className="font-medium">{o.number}</div><div className="text-xs text-slate-500">{o.title}</div></td>
                      <td className="td text-right tabular-nums">{money(o.amount)}<div className="text-[11px] text-slate-400">{terms(o.paymentTerms)}</div></td>
                      <td className="td">{date(o.expectedDelivery)}</td>
                      <td className="td"><StatusBadge status={o.status} /></td>
                      <td className="td text-right">
                        {o.status === "ISSUED" && <button className="btn-success px-2.5 py-1 text-xs" onClick={() => orderAction(o, "accept")}>Accept PO</button>}
                        {o.status === "ACCEPTED" && <button className="btn-secondary px-2.5 py-1 text-xs" onClick={() => orderAction(o, "dispatch")}>Mark dispatched</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}

        {tab === "Documents" && (
          <Card title="Compliance documents" bodyClass="p-0" actions={<button className="btn-secondary text-xs" onClick={() => setDocOpen(true)}>+ Upload / renew</button>}>
            <ul className="divide-y divide-slate-100">
              {vendor.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span><b className="font-medium">{label(d.type)}</b> <span className="text-xs text-slate-500">{d.number}</span></span>
                  <span className="flex items-center gap-2">
                    {d.expiryDate && <span className={`text-xs ${d.expired ? "text-rose-600" : "text-slate-500"}`}>{d.expired ? "Expired" : "Valid till"} {date(d.expiryDate)}</span>}
                    <StatusBadge status={d.verification} />
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {tab === "Messages" && (
          <Card bodyClass="p-0">
            {!messages?.length ? <Empty>No messages.</Empty> : (
              <ul className="divide-y divide-slate-100">
                {messages.map((m, i) => (
                  <li key={i} className="px-5 py-3 text-sm">
                    <div className="flex items-center gap-2"><ChannelChip channel={m.channel} /><b className="font-medium">{m.subject}</b><span className="ml-auto text-xs text-slate-400">{dateTime(m.at)}</span></div>
                    <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-slate-500">{m.body}</pre>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </main>

      <Modal open={!!quoting} wide title={`Quote for ${quoting?.title ?? ""}`} onClose={() => setQuoting(null)}
        footer={<><button className="btn-secondary" onClick={() => setQuoting(null)}>Cancel</button>
          <button className="btn-success" disabled={act.busy || !Number(q.unitPrice)} onClick={submit}>Submit quote · {money(total)}</button></>}>
        {quoting && (
          <div className="space-y-4">
            <ErrorBox message={act.error} onClose={() => act.setError(null)} />
            <p className="text-sm text-slate-600">Quantity: <b>{qty} {quoting.lines[0]?.unit}</b>{quoting.lines[0]?.specs && <> · {quoting.lines[0].specs}</>}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Unit price (₹) *"><input className="input" type="number" min={0} step="0.01" value={q.unitPrice} onChange={(e) => setQ({ ...q, unitPrice: e.target.value })} /></Field>
              <Field label="GST %">
                <select className="input" value={q.taxPercent} onChange={(e) => setQ({ ...q, taxPercent: e.target.value })}>
                  {["0", "5", "12", "18", "28"].map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Delivery charge (₹)"><input className="input" type="number" min={0} value={q.deliveryCharge} onChange={(e) => setQ({ ...q, deliveryCharge: e.target.value })} /></Field>
              <Field label="Delivery in (days)"><input className="input" type="number" min={0} value={q.deliveryDays} onChange={(e) => setQ({ ...q, deliveryDays: e.target.value })} /></Field>
              <Field label="Quote valid for (days)"><input className="input" type="number" min={0} value={q.validityDays} onChange={(e) => setQ({ ...q, validityDays: e.target.value })} /></Field>
              <Field label="Payment terms">
                <select className="input" value={q.paymentTerms} onChange={(e) => setQ({ ...q, paymentTerms: e.target.value })}>
                  <option value="ADVANCE">Advance</option><option value="NET_15">Net 15</option><option value="NET_30">Net 30</option>
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={q.meetsSpecs} onChange={(e) => setQ({ ...q, meetsSpecs: e.target.checked })} /> Meets all requested specifications</label>
            {!q.meetsSpecs && <Field label="Describe the deviation"><input className="input" value={q.specDeviation} onChange={(e) => setQ({ ...q, specDeviation: e.target.value })} /></Field>}
            <Field label="Remarks (brand, warranty…)"><textarea className="input min-h-16" value={q.remarks} onChange={(e) => setQ({ ...q, remarks: e.target.value })} /></Field>
            <div className="flex justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm">
              <span>Subtotal {money(sub)} + GST {money((sub * Number(q.taxPercent || 0)) / 100)} + delivery {money(Number(q.deliveryCharge || 0))}</span>
              <b>{money(total)}</b>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={docOpen} title="Upload / renew document" onClose={() => setDocOpen(false)}
        footer={<><button className="btn-secondary" onClick={() => setDocOpen(false)}>Cancel</button><button className="btn-success" disabled={act.busy} onClick={uploadDoc}>Upload</button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <select className="input" value={doc.type} onChange={(e) => setDoc({ ...doc, type: e.target.value })}>
              {["TRADE_LICENCE", "GST_CERT", "FSSAI", "MSME", "INSURANCE", "CANCELLED_CHEQUE"].map((t) => <option key={t} value={t}>{label(t)}</option>)}
            </select>
          </Field>
          <Field label="Number"><input className="input" value={doc.number} onChange={(e) => setDoc({ ...doc, number: e.target.value })} /></Field>
          <Field label="Valid till"><input className="input" type="date" value={doc.expiryDate} onChange={(e) => setDoc({ ...doc, expiryDate: e.target.value })} /></Field>
        </div>
        <p className="mt-3 text-xs text-slate-500">The school verifies the document, then reactivates your account if it was suspended.</p>
      </Modal>
    </div>
  );
}

function MiniStat({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="card p-4"><div className="text-xs text-slate-500">{k}</div><div className="mt-1 text-xl font-semibold tabular-nums">{v}</div></div>;
}
