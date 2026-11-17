"use client";

import Link from "next/link";
import { Card, Empty, ErrorBox, Loading, PageHeader, StatusBadge } from "@/components/ui";
import { date, money, terms } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { PurchaseOrder } from "@/lib/types";

export default function PurchaseOrdersPage() {
  const { data, error } = useApi<PurchaseOrder[]>("/purchase-orders");
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;
  const total = data.reduce((s, p) => s + p.amount, 0);
  return (
    <>
      <PageHeader title="Purchase orders" subtitle={`${data.length} order(s) · ${money(total, true)} total`} />
      <Card bodyClass="p-0">
        {data.length === 0 ? <Empty>No purchase orders yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-50">
                <tr><th className="th">PO</th><th className="th">Vendor</th><th className="th text-right">Amount</th><th className="th">Terms</th><th className="th">Received</th><th className="th">Expected</th><th className="th">Status</th><th className="th" /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((p) => (
                  <tr key={p.id}>
                    <td className="td">
                      <div className="font-medium">{p.number}</div>
                      <Link href={`/procurement/${p.purchaseRequestId}`} className="text-xs text-indigo-600 hover:underline">{p.purchaseRequestNumber} · {p.title}</Link>
                    </td>
                    <td className="td"><Link href={`/vendors/${p.vendorId}`} className="hover:text-indigo-600">{p.vendorName}</Link></td>
                    <td className="td text-right font-medium tabular-nums">{money(p.amount)}</td>
                    <td className="td">{terms(p.paymentTerms)}</td>
                    <td className="td tabular-nums">{p.acceptedQuantity}/{p.orderedQuantity} {p.unit}{p.rejectedQuantity > 0 && <div className="text-[11px] text-rose-600">{p.rejectedQuantity} rejected</div>}</td>
                    <td className="td">{date(p.expectedDelivery)}{p.overdue && <div className="text-[11px] text-rose-600">Overdue</div>}</td>
                    <td className="td"><StatusBadge status={p.status} /></td>
                    <td className="td text-right">{p.pendingQuantity > 0 && <Link href={`/inventory/receipts/new?po=${p.id}`} className="btn-secondary px-2.5 py-1 text-xs">Receive</Link>}</td>
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
