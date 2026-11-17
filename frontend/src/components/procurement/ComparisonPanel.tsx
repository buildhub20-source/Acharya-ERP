"use client";

import { useState } from "react";
import { Badge, Card, Empty, ErrorBox, Field, Stars } from "@/components/ui";
import { useUser } from "@/components/UserContext";
import { api } from "@/lib/api";
import { money, terms } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { PurchaseRequestDetail } from "@/lib/types";

/** Step 7 (compare) + step 8 (manager review) + step 9 (official approval). */
export default function ComparisonPanel({ detail, onDone }: { detail: PurchaseRequestDetail; onDone: (d: PurchaseRequestDetail) => void }) {
  const pr = detail.request;
  const c = detail.comparison;
  const policy = detail.approvalPolicy;
  const { user } = useUser();
  const reviewOpen = pr.status === "UNDER_REVIEW" || pr.status === "SENT_BACK";
  const approvalOpen = pr.status === "PENDING_APPROVAL";
  const [selected, setSelected] = useState<string | null>(pr.selectedQuoteId ?? c.l1QuoteId);
  const [justification, setJustification] = useState(pr.selectionJustification ?? "");
  const [comments, setComments] = useState("");
  const { busy, error, setError, run } = useAction();

  const chosen = c.rows.find((r) => r.quote.id === selected);
  const needsJustification = (chosen && !chosen.l1) || !c.meetsMinQuotes;
  const sentBack = [...pr.approvals].reverse().find((a) => a.decision === "SENT_BACK");

  const review = async (action: "SELECT" | "REJECT_ALL") => {
    const d = await run(() => api.post<PurchaseRequestDetail>(`/purchase-requests/${pr.id}/review`, {
      action, quoteId: selected, justification, actor: user.name,
    }));
    if (d) onDone(d);
  };
  const decide = async (action: "APPROVE" | "SEND_BACK" | "REJECT") => {
    const d = await run(() => api.post<PurchaseRequestDetail>(`/purchase-requests/${pr.id}/approval`, { action, comments, actor: user.name }));
    if (d) onDone(d);
  };

  if (c.rows.length === 0) return <Card title="Quote comparison"><Empty>Waiting for quotes.</Empty></Card>;

  return (
    <Card title="Quote comparison"
      actions={<span className="text-xs text-ink-mute">{c.quotesReceived} of {c.vendorsInvited} vendors quoted · avg {money(c.averageAmount, true)}</span>}
      bodyClass="p-0">
      <div className="px-5 pt-4">
        <ErrorBox message={error} onClose={() => setError(null)} />
        {!c.meetsMinQuotes && (
          <p className="mb-3 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
            Only {c.quotesReceived} quote(s) received; policy minimum is {c.minQuotesRequired}. Proceeding needs a justification.
          </p>
        )}
        {sentBack && pr.status === "SENT_BACK" && (
          <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            <b>Sent back by {sentBack.approver}:</b> {sentBack.comments}
          </p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-raised">
            <tr>
              {reviewOpen && <th className="th w-10" />}
              <th className="th">#</th><th className="th">Vendor</th><th className="th text-right">Unit</th><th className="th text-right">Tax</th>
              <th className="th text-right">Delivery</th><th className="th text-right">Landed cost</th><th className="th">vs L1</th>
              <th className="th">Lead</th><th className="th">Terms</th><th className="th">Vendor rating</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {c.rows.map((r) => {
              const q = r.quote;
              const isSel = selected === q.id;
              const isChosen = pr.selectedQuoteId === q.id;
              return (
                <tr key={q.id}
                  className={`${r.l1 ? "bg-ok/10" : ""} ${reviewOpen ? "cursor-pointer hover:bg-poster/10" : ""} ${isSel && reviewOpen ? "outline-2 -outline-offset-2 outline-poster" : ""}`}
                  onClick={() => reviewOpen && setSelected(q.id)}>
                  {reviewOpen && <td className="td"><input type="radio" name="quote" checked={isSel} onChange={() => setSelected(q.id)} aria-label={`Select ${q.vendorName}`} /></td>}
                  <td className="td font-semibold">{r.rank}</td>
                  <td className="td">
                    <div className="flex flex-wrap items-center gap-1.5 font-medium">
                      {q.vendorName}
                      {r.l1 && <Badge tone="green">L1 · lowest</Badge>}
                      {isChosen && !reviewOpen && <Badge tone="indigo">Selected</Badge>}
                      {q.needsReview && <Badge tone="amber">Verify</Badge>}
                      {!q.meetsSpecs && <Badge tone="red">Spec gap</Badge>}
                      {q.late && <Badge tone="red">Late</Badge>}
                    </div>
                  </td>
                  <td className="td text-right tabular-nums">{money(q.unitPrice)}</td>
                  <td className="td text-right tabular-nums">{money(q.taxAmount)}<div className="text-[11px] text-ink-mute">{q.taxPercent}%</div></td>
                  <td className="td text-right tabular-nums">{q.deliveryCharge ? money(q.deliveryCharge) : "Free"}</td>
                  <td className="td text-right font-semibold tabular-nums">{money(q.landedCost)}</td>
                  <td className="td tabular-nums">{r.l1 ? "—" : <span className="text-danger">+{r.diffFromL1Pct}%</span>}</td>
                  <td className="td">{q.deliveryDays}d</td>
                  <td className="td text-xs">{terms(q.paymentTerms)}</td>
                  <td className="td"><Stars value={r.vendorRating} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-rule p-5">
        <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${policy.requiresOfficial ? "bg-poster/10 text-poster" : "bg-ok/10 text-ok"}`}>
          <b>Approval route:</b> {policy.reason}. {policy.requiresOfficial ? "Manager approval → higher official sign-off → PO." : "Manager approval issues the PO directly."}
        </div>

        {reviewOpen && (
          user.role === "OFFICIAL" ? <p className="text-sm text-ink-mute">Waiting for the store manager to pick a vendor.</p> : (
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <Field label={needsJustification ? "Justification (required)" : "Notes (optional)"}
                hint={chosen && !chosen.l1 ? "You are not picking the lowest quote: explain why (quality, delivery time, terms…)" : undefined}>
                <textarea className="input min-h-20" value={justification} onChange={(e) => setJustification(e.target.value)} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary" disabled={busy} onClick={() => review("REJECT_ALL")} title="Reject every quote and start a new RFQ round">
                  Reject all · re-quote
                </button>
                <button className="btn-primary" disabled={busy || !selected} onClick={() => review("SELECT")}>
                  Approve {chosen?.quote.vendorName ?? "vendor"} · {money(chosen?.quote.landedCost)}
                </button>
              </div>
            </div>
          )
        )}

        {approvalOpen && (
          <div>
            {pr.selectionJustification && (
              <p className="mb-3 text-sm text-ink-soft"><b>Manager&apos;s justification:</b> {pr.selectionJustification}</p>
            )}
            {user.role === "OFFICIAL" || user.role === "ADMIN" ? (
              <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
                <Field label="Comments (required to send back or reject)">
                  <textarea className="input min-h-20" value={comments} onChange={(e) => setComments(e.target.value)} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-danger" disabled={busy} onClick={() => decide("REJECT")}>Reject</button>
                  <button className="btn-secondary" disabled={busy} onClick={() => decide("SEND_BACK")}>Send back to manager</button>
                  <button className="btn-success" disabled={busy} onClick={() => decide("APPROVE")}>Approve &amp; issue PO</button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-mute">Awaiting second-level sign-off. Switch to <b>Dr. Meenakshi (Principal)</b> in the top bar to act.</p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
