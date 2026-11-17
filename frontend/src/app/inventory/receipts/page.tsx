"use client";

import Link from "next/link";
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, StatusBadge } from "@/components/ui";
import { date, money } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { GoodsReceipt, PurchaseOrder } from "@/lib/types";

export default function ReceiptsPage() {
  const { data: pending, error } = useApi<PurchaseOrder[]>("/grns/pending");
  const { data: grns } = useApi<GoodsReceipt[]>("/grns");
  if (error) return <ErrorBox message={error} />;
  if (!pending || !grns) return <Loading />;

  return (
    <>
      <PageHeader title="Goods receipt (GRN)" subtitle="Check deliveries against the PO, accept or reject units, and post accepted stock into the store" />

      <Card title={`Awaiting delivery (${pending.length})`} className="mb-6" bodyClass="p-0">
        {pending.length === 0 ? <Empty>No purchase orders waiting for delivery.</Empty> : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-raised">
                <tr><th className="th">PO</th><th className="th">Vendor</th><th className="th">Item</th><th className="th">Progress</th><th className="th">Expected</th><th className="th">Status</th><th className="th" /></tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {pending.map((o) => {
                  const pct = Math.round((o.acceptedQuantity / o.orderedQuantity) * 100);
                  return (
                    <tr key={o.id}>
                      <td className="td"><div className="font-medium">{o.number}</div><Link href={`/procurement/${o.purchaseRequestId}`} className="text-xs text-poster hover:underline">{o.purchaseRequestNumber}</Link></td>
                      <td className="td">{o.vendorName}</td>
                      <td className="td">{o.description}</td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-raised-2"><div className="h-full bg-ok" style={{ width: `${pct}%` }} /></div>
                          <span className="text-xs tabular-nums text-ink-soft">{o.acceptedQuantity}/{o.orderedQuantity} {o.unit}</span>
                        </div>
                        {o.rejectedQuantity > 0 && <div className="mt-0.5 text-[11px] text-danger">{o.rejectedQuantity} rejected, awaiting replacement</div>}
                      </td>
                      <td className="td">{date(o.expectedDelivery)} {o.overdue && <Badge tone="red">Overdue</Badge>}</td>
                      <td className="td"><StatusBadge status={o.status} /></td>
                      <td className="td text-right"><Link href={`/inventory/receipts/new?po=${o.id}`} className="btn-primary px-3 py-1.5 text-xs">Receive goods</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Receipt history" bodyClass="p-0">
        {grns.length === 0 ? <Empty>No goods received yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-raised">
                <tr><th className="th">GRN</th><th className="th">Vendor / item</th><th className="th text-right">Received</th><th className="th text-right">Accepted</th><th className="th text-right">Rejected</th><th className="th">Delivery</th><th className="th">Invoice</th></tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {grns.map((g) => (
                  <tr key={g.id}>
                    <td className="td"><Link href={`/inventory/receipts/${g.id}`} className="font-medium text-poster hover:underline">{g.number}</Link><div className="text-xs text-ink-mute">{date(g.receivedDate)} · {g.purchaseOrderNumber}</div></td>
                    <td className="td"><div>{g.vendorName}</div><div className="text-xs text-ink-mute">{g.description}</div></td>
                    <td className="td text-right tabular-nums">{g.receivedQuantity}</td>
                    <td className="td text-right tabular-nums text-ok">{g.acceptedQuantity}</td>
                    <td className="td text-right tabular-nums">{g.rejectedQuantity ? <span className="text-danger">{g.rejectedQuantity}</span> : "—"}</td>
                    <td className="td">{g.onTime ? <Badge tone="green">On time</Badge> : <Badge tone="red">Late</Badge>}</td>
                    <td className="td"><StatusBadge status={g.invoiceMatch} /><div className="text-[11px] text-ink-mute">{g.invoiceAmount != null ? money(g.invoiceAmount) : ""}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
