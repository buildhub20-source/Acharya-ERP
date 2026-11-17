"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Badge, Card, ErrorBox, Field, Loading, PageHeader, StatusBadge } from "@/components/ui";
import { useUser } from "@/components/UserContext";
import { api } from "@/lib/api";
import { date, money } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import type { GoodsReceipt, ReceivablePo } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);

function ReceiveForm() {
  const poId = useSearchParams().get("po");
  const router = useRouter();
  const { user } = useUser();
  const { data, error } = useApi<ReceivablePo>(poId ? `/grns/receivable/${poId}` : null);
  const act = useAction();
  const [f, setF] = useState<Record<string, string> | null>(null);

  if (!poId) return <ErrorBox message="No purchase order selected. Pick one from Goods receipt." />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;
  const po = data.order;
  const form = f ?? {
    received: String(po.pendingQuantity), rejected: "0", rejectionReason: "", deliveryChallan: "", invoiceNumber: "",
    invoiceAmount: "", receivedDate: today(), inspectedBy: "", storeLocation: data.item?.location ?? "", notes: "",
  };
  const set = (k: string, v: string) => setF({ ...form, [k]: v });

  const received = Number(form.received || 0);
  const rejected = Number(form.rejected || 0);
  const accepted = Math.max(0, received - rejected);
  const acceptedValue = accepted * po.unitCost;
  const invoice = form.invoiceAmount ? Number(form.invoiceAmount) : null;
  const invoiceOk = invoice == null ? null : Math.abs(invoice - acceptedValue) <= acceptedValue * 0.01;
  const late = form.receivedDate > po.expectedDelivery;
  const over = accepted > po.pendingQuantity;

  const submit = async () => {
    const g = await act.run(() => api.post<GoodsReceipt>("/grns", {
      purchaseOrderId: po.id, acceptedQuantity: accepted, rejectedQuantity: rejected, rejectionReason: form.rejectionReason,
      deliveryChallan: form.deliveryChallan, invoiceNumber: form.invoiceNumber, invoiceAmount: invoice,
      receivedDate: form.receivedDate, receivedBy: user.name, inspectedBy: form.inspectedBy, storeLocation: form.storeLocation, notes: form.notes,
    }));
    if (g) router.push(`/inventory/receipts/${g.id}`);
  };

  return (
    <>
      <PageHeader back={{ href: "/inventory/receipts", label: "Goods receipt" }} title={`Receive goods · ${po.number}`}
        subtitle={<>{po.vendorName} · <Link className="text-poster hover:underline" href={`/procurement/${po.purchaseRequestId}`}>{po.purchaseRequestNumber}</Link> · {po.title}</>} />
      <ErrorBox message={act.error} onClose={() => act.setError(null)} />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card title="Quantity check">
            <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Mini k="Ordered" v={`${po.orderedQuantity} ${po.unit}`} />
              <Mini k="Already accepted" v={po.acceptedQuantity} />
              <Mini k="Pending" v={po.pendingQuantity} strong />
              <Mini k="Unit cost (landed)" v={money(po.unitCost)} />
            </div>
            <p className="mb-4 text-sm text-ink-soft"><b>{po.description}</b>{data.item ? <span className="text-ink-mute"> · {data.item.sku}</span> : <Badge tone="purple">New item: will be added to the item master</Badge>}</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Received in this delivery *"><input className="input" type="number" min={0} value={form.received} onChange={(e) => set("received", e.target.value)} /></Field>
              <Field label="Rejected on inspection" hint="Damaged, wrong size, not to spec"><input className="input" type="number" min={0} max={received} value={form.rejected} onChange={(e) => set("rejected", e.target.value)} /></Field>
              <div className="rounded-lg bg-ok/10 p-3">
                <div className="text-xs text-ok">Accepted into stock</div>
                <div className="text-2xl font-semibold tabular-nums text-ok">{accepted} <span className="text-sm font-normal">{po.unit}</span></div>
              </div>
              {rejected > 0 && (
                <Field label="Rejection reason *" className="sm:col-span-3"><input className="input" value={form.rejectionReason} onChange={(e) => set("rejectionReason", e.target.value)} placeholder="e.g. 3 pairs size 7 had torn stitching" /></Field>
              )}
            </div>
            {over && <p className="mt-3 text-sm text-danger">Only {po.pendingQuantity} {po.unit} are pending. Return the extra {accepted - po.pendingQuantity} to the vendor.</p>}
            {!over && accepted > 0 && accepted < po.pendingQuantity && (
              <p className="mt-3 text-xs text-warn">Partial delivery: {po.pendingQuantity - accepted} {po.unit} will stay pending on this PO.</p>
            )}
            {rejected > 0 && <p className="mt-2 text-xs text-ink-mute">The vendor is notified to collect rejected units and send replacements. They stay pending on the PO.</p>}
          </Card>

          <Card title="Delivery & invoice">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Received on"><input className="input" type="date" max={today()} value={form.receivedDate} onChange={(e) => set("receivedDate", e.target.value)} /></Field>
              <Field label="Delivery challan no."><input className="input" value={form.deliveryChallan} onChange={(e) => set("deliveryChallan", e.target.value)} /></Field>
              <Field label="Inspected by"><input className="input" value={form.inspectedBy} onChange={(e) => set("inspectedBy", e.target.value)} /></Field>
              <Field label="Invoice no."><input className="input" value={form.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)} /></Field>
              <Field label="Invoice amount (₹)" hint={`Expected ${money(acceptedValue)} for ${accepted} accepted`}>
                <input className="input" type="number" min={0} step="0.01" value={form.invoiceAmount} onChange={(e) => set("invoiceAmount", e.target.value)} />
              </Field>
              <Field label="Store location"><input className="input" value={form.storeLocation} onChange={(e) => set("storeLocation", e.target.value)} /></Field>
              <Field label="Notes" className="sm:col-span-3"><input className="input" value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
            </div>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card title="Checks">
            <ul className="space-y-3 text-sm">
              <li className="flex justify-between gap-2"><span>Quantity vs PO</span>{over ? <Badge tone="red">Excess</Badge> : accepted === po.pendingQuantity ? <Badge tone="green">Complete</Badge> : <Badge tone="amber">Partial</Badge>}</li>
              <li className="flex justify-between gap-2"><span>Delivery date (due {date(po.expectedDelivery)})</span>{late ? <Badge tone="red">Late</Badge> : <Badge tone="green">On time</Badge>}</li>
              <li className="flex justify-between gap-2"><span>Invoice match (3-way)</span>{invoiceOk == null ? <StatusBadge status="NOT_PROVIDED" /> : invoiceOk ? <StatusBadge status="MATCHED" /> : <StatusBadge status="MISMATCH" />}</li>
              <li className="flex justify-between gap-2"><span>Stock after receipt</span><b className="tabular-nums">{(data.item?.onHand ?? 0) + accepted} {po.unit}</b></li>
            </ul>
            <p className="mt-3 text-xs text-ink-mute">On-time and acceptance rate feed the vendor&apos;s performance score.</p>
          </Card>
          <button className="btn-success w-full" disabled={act.busy || received <= 0 || rejected > received || over || (rejected > 0 && !form.rejectionReason.trim())} onClick={submit}>
            {act.busy ? "Posting…" : `Post GRN · ${accepted} into stock`}
          </button>
          {data.receipts.length > 0 && (
            <Card title="Earlier receipts on this PO">
              <ul className="space-y-2 text-xs">
                {data.receipts.map((g) => (
                  <li key={g.id}><Link className="text-poster hover:underline" href={`/inventory/receipts/${g.id}`}>{g.number}</Link> · {date(g.receivedDate)} · {g.acceptedQuantity} accepted{g.rejectedQuantity ? `, ${g.rejectedQuantity} rejected` : ""}</li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

function Mini({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return <div className="rounded-lg bg-raised p-3"><div className="text-xs text-ink-mute">{k}</div><div className={`tabular-nums ${strong ? "text-lg font-semibold text-ink" : "text-ink-soft"}`}>{v}</div></div>;
}

export default function ReceivePage() {
  return <Suspense fallback={<Loading />}><ReceiveForm /></Suspense>;
}
