"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import ComparisonPanel from "@/components/procurement/ComparisonPanel";
import QuotesPanel from "@/components/procurement/QuotesPanel";
import RfqTracking from "@/components/procurement/RfqTracking";
import VendorSelection from "@/components/procurement/VendorSelection";
import WorkflowStepper from "@/components/procurement/WorkflowStepper";
import { Badge, Card, ErrorBox, Field, Loading, Modal, PageHeader, StatusBadge } from "@/components/ui";
import { useUser } from "@/components/UserContext";
import { api } from "@/lib/api";
import { date, dateTime, label, money, terms } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import type { PurchaseRequestDetail } from "@/lib/types";

export default function PurchaseRequestPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const { data: d, error, reload, setData } = useApi<PurchaseRequestDetail>(`/purchase-requests/${id}`);
  const act = useAction();
  const [inviteMore, setInviteMore] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  if (error) return <ErrorBox message={error} />;
  if (!d) return <Loading />;

  const pr = d.request;
  const collecting = pr.status === "RFQ_SENT" || pr.status === "COLLECTING_QUOTES";
  const selecting = pr.status === "DRAFT" || pr.status === "REJECTED_REQUOTE";
  const closed = pr.status === "PO_ISSUED" || pr.status === "CANCELLED";
  const line = pr.lines[0];
  const currentRoundVendorIds = d.rfqs.filter((r) => r.round === pr.round).map((r) => r.vendorId);
  const officialSkipped = pr.status === "PO_ISSUED" && !pr.approvals.some((a) => a.level === "OFFICIAL");

  const post = async (path: string, body?: unknown) => {
    const res = await act.run(() => api.post<PurchaseRequestDetail>(path, body));
    if (res) setData(res);
    return res;
  };

  return (
    <>
      <PageHeader
        back={{ href: "/procurement", label: "Purchase requests" }}
        title={<span className="flex flex-wrap items-center gap-3">{pr.title} <StatusBadge status={pr.status} /></span>}
        subtitle={<>{pr.number} · {d.categoryName} · {pr.department} · requested by {pr.requestedBy}</>}
        actions={!closed && <button className="btn-ghost text-rose-600" onClick={() => setCancelOpen(true)}>Cancel request</button>}
      />
      <ErrorBox message={act.error} onClose={() => act.setError(null)} />

      <WorkflowStepper status={pr.status} skipOfficial={officialSkipped} poStatus={d.purchaseOrder?.status} />

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          {d.purchaseOrder && (
            <div className="card border-emerald-200 bg-emerald-50/50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">Purchase order confirmed</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{d.purchaseOrder.number} · {d.purchaseOrder.vendorName}</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {money(d.purchaseOrder.amount)} · {terms(d.purchaseOrder.paymentTerms)} · expected by {date(d.purchaseOrder.expectedDelivery)}
                  </div>
                </div>
                <StatusBadge status={d.purchaseOrder.status} />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-emerald-100 pt-3">
                <div className="text-sm text-slate-700">
                  Received <b>{d.purchaseOrder.acceptedQuantity}</b> of {d.purchaseOrder.orderedQuantity} {d.purchaseOrder.unit}
                  {d.purchaseOrder.rejectedQuantity > 0 && <span className="text-rose-600"> · {d.purchaseOrder.rejectedQuantity} rejected</span>}
                  {d.purchaseOrder.overdue && <span className="text-rose-600"> · delivery overdue</span>}
                </div>
                {d.purchaseOrder.pendingQuantity > 0
                  ? <Link href={`/inventory/receipts/new?po=${d.purchaseOrder.id}`} className="btn-success">Receive goods (GRN)</Link>
                  : <Link href={`/inventory/${d.purchaseOrder.itemId}`} className="btn-secondary">View stock</Link>}
              </div>
            </div>
          )}

          {selecting && (user.role === "OFFICIAL"
            ? <Card title="Select vendors"><p className="text-sm text-slate-500">The store manager will select vendors and send the RFQ.</p></Card>
            : <VendorSelection detail={d} onDone={setData} />)}

          {(collecting || d.rfqs.length > 0) && !selecting && (
            <>
              {collecting && (
                <div className="card flex flex-wrap items-center justify-between gap-3 border-emerald-200 bg-emerald-50/40 p-4">
                  <div className="text-sm text-slate-700">
                    <b>Collecting quotes.</b> Vendors who don&apos;t reply get an automatic reminder every 24h (max 3).
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-secondary" disabled={act.busy} onClick={() => post(`/purchase-requests/${pr.id}/simulate`)}
                      title="Mock: advance delivery/read receipts and let some vendors reply">
                      ⟳ Simulate vendor activity
                    </button>
                    <button className="btn-secondary" onClick={() => setInviteMore((v) => !v)}>+ Invite more</button>
                    <button className="btn-primary" disabled={act.busy || d.comparison.quotesReceived === 0}
                      onClick={() => post(`/purchase-requests/${pr.id}/close-quotes`, { actor: user.name })}>
                      Close quotes &amp; compare →
                    </button>
                  </div>
                </div>
              )}
              {inviteMore && collecting && (
                <VendorSelection detail={d} alreadyInvited={currentRoundVendorIds} onDone={(x) => { setData(x); setInviteMore(false); }} />
              )}
              {d.rfqs.some((r) => r.round === pr.round) && <RfqTracking detail={d} onChange={reload} />}
              <QuotesPanel detail={d} onChange={reload} />
            </>
          )}

          {d.comparison.rows.length > 0 && !collecting && !selecting && <ComparisonPanel detail={d} onDone={setData} />}
          {collecting && d.comparison.rows.length > 1 && (
            <p className="text-xs text-slate-500">
              Current lowest landed cost: <b>{money(d.comparison.l1Amount)}</b> ({d.comparison.rows[0].quote.vendorName}). The full comparison opens once quotes are closed.
            </p>
          )}
        </div>

        <aside className="space-y-6">
          <Card title="Request">
            <dl className="space-y-3 text-sm">
              <div><dt className="text-xs text-slate-500">Item</dt><dd className="font-medium">{line?.description}</dd></div>
              {line?.specs && <div><dt className="text-xs text-slate-500">Specs</dt><dd>{line.specs}</dd></div>}
              <div className="grid grid-cols-2 gap-3">
                <div><dt className="text-xs text-slate-500">Quantity</dt><dd className="font-medium">{pr.totalQuantity} {line?.unit}</dd></div>
                <div><dt className="text-xs text-slate-500">Needed by</dt><dd>{date(pr.dueDate)}</dd></div>
                <div><dt className="text-xs text-slate-500">Budget</dt><dd>{money(pr.budgetAmount, true)}</dd></div>
                <div><dt className="text-xs text-slate-500">Round</dt><dd>{pr.round}</dd></div>
              </div>
              <div><dt className="text-xs text-slate-500">Deliver to</dt><dd>{pr.deliveryLocation || "—"}</dd></div>
              <div><dt className="text-xs text-slate-500">Budget head</dt><dd>{pr.budgetHead || "—"}</dd></div>
              {pr.quoteDeadline && <div><dt className="text-xs text-slate-500">Quote deadline</dt><dd>{dateTime(pr.quoteDeadline)}</dd></div>}
            </dl>
          </Card>

          {pr.approvals.length > 0 && (
            <Card title="Approvals">
              <ol className="space-y-3 text-sm">
                {pr.approvals.map((a, i) => (
                  <li key={i}>
                    <div className="flex items-center gap-2">
                      <Badge tone={a.decision === "APPROVED" ? "green" : a.decision === "REJECTED" ? "red" : "amber"}>{label(a.decision)}</Badge>
                      <span className="text-xs text-slate-500">{a.level === "MANAGER" ? "Level 1" : "Level 2"}</span>
                    </div>
                    <div className="mt-1 font-medium">{a.approver}</div>
                    {a.comments && <div className="text-xs text-slate-600">“{a.comments}”</div>}
                    <div className="text-[11px] text-slate-400">{dateTime(a.at)}</div>
                  </li>
                ))}
              </ol>
            </Card>
          )}

          <Card title="Audit trail" bodyClass="p-0">
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {pr.audit.map((a, i) => (
                <li key={i} className="px-5 py-2.5 text-xs">
                  <div className="flex justify-between gap-2"><b className="font-medium text-slate-700">{label(a.action)}</b><span className="text-slate-400">{dateTime(a.at)}</span></div>
                  <div className="text-slate-500">{a.details}</div>
                  <div className="text-slate-400">{a.by}</div>
                </li>
              ))}
            </ul>
          </Card>
          {d.purchaseOrder && <Link href="/purchase-orders" className="btn-secondary w-full">View all purchase orders</Link>}
        </aside>
      </div>

      <Modal open={cancelOpen} title="Cancel this request?" onClose={() => setCancelOpen(false)}
        footer={<><button className="btn-secondary" onClick={() => setCancelOpen(false)}>Keep</button>
          <button className="btn-danger" disabled={act.busy} onClick={async () => {
            if (await post(`/purchase-requests/${pr.id}/cancel`, { actor: user.name, reason: cancelReason })) setCancelOpen(false);
          }}>Cancel request</button></>}>
        <Field label="Reason"><textarea className="input min-h-20" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></Field>
      </Modal>
    </>
  );
}
