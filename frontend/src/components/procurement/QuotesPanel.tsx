"use client";

import { useState } from "react";
import { Badge, Card, Empty, ErrorBox, Field, Modal } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime, money, terms } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { PurchaseRequestDetail, Quote } from "@/lib/types";

const SRC: Record<string, string> = {
  PORTAL: "Vendor portal", EMAIL_TEXT: "Email", WHATSAPP_TEXT: "WhatsApp", SMS_TEXT: "SMS", PDF: "PDF", IMAGE: "Image · OCR", VOICE: "Voice · STT", MANUAL: "Manual entry",
};

/** Step 6: parsed responses, with confidence and a verify/correct flow. */
export default function QuotesPanel({ detail, onChange }: { detail: PurchaseRequestDetail; onChange: () => void }) {
  const pr = detail.request;
  const quotes = detail.quotes.filter((q) => q.round === pr.round);
  const [edit, setEdit] = useState<Quote | null>(null);
  const [raw, setRaw] = useState<Quote | null>(null);
  const { busy, error, setError, run } = useAction();
  const editable = ["RFQ_SENT", "COLLECTING_QUOTES", "UNDER_REVIEW", "SENT_BACK"].includes(pr.status);

  const save = async () => {
    if (!edit) return;
    const ok = await run(() => api.put(`/purchase-requests/${pr.id}/quotes/${edit.id}`, {
      rfqId: edit.rfqId, unitPrice: Number(edit.unitPrice), taxPercent: Number(edit.taxPercent), deliveryCharge: Number(edit.deliveryCharge),
      deliveryDays: Number(edit.deliveryDays), validityDays: Number(edit.validityDays), paymentTerms: edit.paymentTerms,
      meetsSpecs: edit.meetsSpecs, specDeviation: edit.specDeviation,
    }));
    if (ok) { setEdit(null); onChange(); }
  };

  return (
    <Card title={`Responses received (${quotes.length})`} bodyClass="p-0">
      {quotes.length === 0 ? <Empty>No responses yet. Replies from email, WhatsApp, PDF, image or voice will appear here as structured quotes.</Empty> : (
        <ul className="divide-y divide-slate-100">
          {quotes.map((q) => {
            const flagged = (f: string) => q.lowConfidenceFields.includes(f) && !q.manuallyVerified;
            const cell = (f: string, v: React.ReactNode) => <span className={flagged(f) ? "rounded bg-amber-100 px-1 text-amber-900" : ""} title={flagged(f) ? "Low confidence: please verify" : undefined}>{v}</span>;
            return (
              <li key={q.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{q.vendorName}</span>
                  <Badge tone="gray">{SRC[q.source]}</Badge>
                  {q.version > 1 && <Badge tone="purple">v{q.version}</Badge>}
                  {q.late && <Badge tone="red">Late</Badge>}
                  {q.needsReview ? <Badge tone="amber">Needs review · {(q.parseConfidence * 100).toFixed(0)}% confidence</Badge>
                    : q.source !== "PORTAL" && q.source !== "MANUAL" && <Badge tone="green">{q.manuallyVerified ? "Verified" : `Parsed · ${(q.parseConfidence * 100).toFixed(0)}%`}</Badge>}
                  <span className="ml-auto text-xs text-slate-400">{dateTime(q.receivedAt)}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-6">
                  <KV k="Unit price" v={cell("unitPrice", money(q.unitPrice))} />
                  <KV k="GST" v={cell("taxPercent", `${q.taxPercent}%`)} />
                  <KV k="Delivery" v={cell("deliveryCharge", q.deliveryCharge ? money(q.deliveryCharge) : "Free")} />
                  <KV k="Lead time" v={cell("deliveryDays", `${q.deliveryDays} days`)} />
                  <KV k="Validity" v={cell("validityDays", `${q.validityDays} days`)} />
                  <KV k="Landed cost" v={<b>{money(q.landedCost)}</b>} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span>Terms: {terms(q.paymentTerms)}</span>
                  {q.remarks && <span>· {q.remarks}</span>}
                  {!q.meetsSpecs && <span className="text-rose-600">· Spec deviation: {q.specDeviation}</span>}
                  {q.rawText && <button className="text-indigo-600 hover:underline" onClick={() => setRaw(q)}>View original{q.attachmentName ? ` (${q.attachmentName})` : ""}</button>}
                  {editable && (q.needsReview || q.source !== "PORTAL") && (
                    <button className="text-indigo-600 hover:underline" onClick={() => setEdit({ ...q })}>{q.needsReview ? "Verify & correct" : "Edit"}</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={!!raw} title={`Original reply · ${raw?.vendorName}`} onClose={() => setRaw(null)} wide>
        <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-700">{raw?.rawText}</pre>
      </Modal>

      <Modal open={!!edit} title={`Verify quote · ${edit?.vendorName}`} onClose={() => setEdit(null)} wide
        footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>Confirm values</button></>}>
        {edit && (
          <div className="space-y-4">
            <ErrorBox message={error} onClose={() => setError(null)} />
            {edit.rawText && <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-600">{edit.rawText}</pre>}
            <div className="grid gap-3 sm:grid-cols-3">
              {([["unitPrice", "Unit price (₹)"], ["taxPercent", "GST %"], ["deliveryCharge", "Delivery charge (₹)"], ["deliveryDays", "Delivery days"], ["validityDays", "Validity days"]] as const).map(([k, l]) => (
                <Field key={k} label={l + (edit.lowConfidenceFields.includes(k) ? " ⚠" : "")}>
                  <input className={`input ${edit.lowConfidenceFields.includes(k) ? "border-amber-400 bg-amber-50" : ""}`} type="number" step="any"
                    value={edit[k] as number} onChange={(e) => setEdit({ ...edit, [k]: e.target.value as unknown as number })} />
                </Field>
              ))}
              <Field label="Payment terms">
                <select className="input" value={edit.paymentTerms ?? ""} onChange={(e) => setEdit({ ...edit, paymentTerms: e.target.value || null })}>
                  <option value="">Not stated</option><option value="ADVANCE">Advance</option><option value="NET_15">Net 15</option><option value="NET_30">Net 30</option>
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={edit.meetsSpecs} onChange={(e) => setEdit({ ...edit, meetsSpecs: e.target.checked })} /> Meets the requested specs
            </label>
            {!edit.meetsSpecs && (
              <Field label="Deviation"><input className="input" value={edit.specDeviation ?? ""} onChange={(e) => setEdit({ ...edit, specDeviation: e.target.value })} /></Field>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div><div className="text-[11px] text-slate-400">{k}</div><div className="tabular-nums text-slate-700">{v}</div></div>;
}
