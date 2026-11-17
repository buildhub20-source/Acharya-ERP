"use client";

import { useEffect, useState } from "react";
import { Card, ErrorBox, Field, Loading, ScoreBar, Stars, StatusBadge } from "@/components/ui";
import { useUser } from "@/components/UserContext";
import { api } from "@/lib/api";
import { terms, toLocalInput } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import type { PurchaseRequestDetail, Vendor } from "@/lib/types";

/** Steps 2-4: pick vendors, preview the templated RFQ, send on all channels. */
export default function VendorSelection({ detail, onDone, alreadyInvited = [] }: {
  detail: PurchaseRequestDetail; onDone: (d: PurchaseRequestDetail) => void; alreadyInvited?: string[];
}) {
  const pr = detail.request;
  const { user } = useUser();
  const { data: vendors, loading } = useApi<Vendor[]>(`/purchase-requests/${pr.id}/suggested-vendors`);
  const [selected, setSelected] = useState<string[]>([]);
  const [deadline, setDeadline] = useState(() => toLocalInput(new Date(Date.now() + 3 * 86400000)));
  const { busy, error, setError, run } = useAction();

  // Pre-select the top eligible vendors (up to 5) that haven't been invited this round.
  useEffect(() => {
    if (!vendors) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time default selection once data arrives
    setSelected(vendors.filter((v) => v.rfqEligible && !alreadyInvited.includes(v.id)).slice(0, 5).map((v) => v.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendors]);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const send = async () => {
    if (selected.length === 0) return setError("Select at least one vendor");
    const d = await run(() => api.post<PurchaseRequestDetail>(`/purchase-requests/${pr.id}/rfqs`, {
      vendorIds: selected, quoteDeadline: pr.quoteDeadline && alreadyInvited.length ? undefined : deadline, actor: user.name,
    }));
    if (d) onDone(d);
  };

  const line = pr.lines[0];
  return (
    <Card title={alreadyInvited.length ? "Invite more vendors" : `Select vendors · ${detail.categoryName}`}>
      <ErrorBox message={error} onClose={() => setError(null)} />
      {pr.status === "REJECTED_REQUOTE" && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          All quotes were rejected. This is round {pr.round}: add new vendors or adjust and re-send.
        </p>
      )}
      {loading ? <Loading /> : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full">
            <thead className="bg-slate-50">
              <tr><th className="th w-10" /><th className="th">Vendor</th><th className="th">Score</th><th className="th">Rating</th><th className="th">Lead time</th><th className="th">Terms</th><th className="th">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vendors?.map((v) => {
                const invited = alreadyInvited.includes(v.id);
                const disabled = !v.rfqEligible || invited;
                return (
                  <tr key={v.id} className={disabled ? "bg-slate-50/60 text-slate-400" : "cursor-pointer hover:bg-indigo-50/40"} onClick={() => !disabled && toggle(v.id)}>
                    <td className="td"><input type="checkbox" disabled={disabled} checked={selected.includes(v.id)} onChange={() => toggle(v.id)} onClick={(e) => e.stopPropagation()} aria-label={`Select ${v.displayName}`} /></td>
                    <td className="td">
                      <div className="font-medium">{v.displayName}</div>
                      <div className="text-xs text-slate-500">{v.city} · {v.contacts[0]?.preferredChannel.toLowerCase()} {v.portalEnabled && "· portal"}</div>
                    </td>
                    <td className="td"><ScoreBar value={v.performance.overallScore} /></td>
                    <td className="td"><Stars value={v.performance.manualRating} /></td>
                    <td className="td">{v.leadTimeDays ? `${v.leadTimeDays}d` : "—"}</td>
                    <td className="td">{terms(v.paymentTerms)}</td>
                    <td className="td">{invited ? <span className="text-xs">Already invited</span> : <StatusBadge status={v.status} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          {!alreadyInvited.length && (
            <Field label="Quote deadline" hint="Vendors get auto-reminders until this time">
              <input className="input" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </Field>
          )}
          <p className="mt-3 text-sm text-slate-600">
            {selected.length} vendor(s) selected. The RFQ goes out on each vendor&apos;s channels (email, WhatsApp/SMS and the portal) with a unique reference.
          </p>
          {selected.length > 0 && selected.length < 3 && !alreadyInvited.length && (
            <p className="mt-2 text-xs text-amber-700">Policy requires at least 3 quotes. Invite more vendors if you can.</p>
          )}
          <button className="btn-primary mt-4" disabled={busy || selected.length === 0} onClick={send}>
            {busy ? "Sending…" : `Generate & send RFQ to ${selected.length} vendor(s)`}
          </button>
        </div>
        <div>
          <div className="field-label">RFQ preview (generated from this request)</div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-xs text-slate-600 ring-1 ring-slate-200">
{`Dear <Vendor>,

Greenfield Public School invites your quotation for the following.
Reference: RFQ-…

1. ${line?.description} - Qty ${line?.quantity} ${line?.unit}${line?.specs ? ` (${line.specs})` : ""}

Required delivery by: ${pr.dueDate}${pr.deliveryLocation ? `\nDeliver to: ${pr.deliveryLocation}` : ""}
Please reply by: ${deadline.replace("T", " ")}

Kindly include: unit price, GST %, delivery charges, delivery days, quote validity and payment terms.`}
          </pre>
        </div>
      </div>
    </Card>
  );
}
