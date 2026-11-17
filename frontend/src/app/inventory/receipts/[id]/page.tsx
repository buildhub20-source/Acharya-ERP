"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge, Card, ErrorBox, Loading, PageHeader, StatusBadge } from "@/components/ui";
import { date, dateTime, money } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { GoodsReceipt } from "@/lib/types";

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { data: g, error } = useApi<GoodsReceipt>(`/grns/${id}`);
  if (error) return <ErrorBox message={error} />;
  if (!g) return <Loading />;
  const rows: [string, React.ReactNode][] = [
    ["Purchase order", <Link key="po" className="text-indigo-600 hover:underline" href={`/procurement/${g.purchaseRequestId}`}>{g.purchaseOrderNumber}</Link>],
    ["Vendor", <Link key="v" className="hover:text-indigo-600" href={`/vendors/${g.vendorId}`}>{g.vendorName}</Link>],
    ["Item", <Link key="i" className="hover:text-indigo-600" href={`/inventory/${g.itemId}`}>{g.description}</Link>],
    ["Received on", <>{date(g.receivedDate)} {g.onTime ? <Badge tone="green">On time</Badge> : <Badge tone="red">Late (due {date(g.expectedDate)})</Badge>}</>],
    ["Delivery challan", g.deliveryChallan || "—"],
    ["Received by", g.receivedBy],
    ["Inspected by", g.inspectedBy || "—"],
    ["Store location", g.storeLocation || "—"],
  ];

  return (
    <>
      <PageHeader back={{ href: "/inventory/receipts", label: "Goods receipt" }}
        title={<span className="flex items-center gap-3">{g.number} {g.complete ? <Badge tone="green">PO complete</Badge> : <Badge tone="amber">Partial</Badge>}</span>}
        subtitle={`Posted ${dateTime(g.createdAt)}`}
        actions={<button className="btn-secondary" onClick={() => window.print()}>Print</button>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Quantities" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {[["Ordered", g.orderedQuantity], ["Accepted earlier", g.previouslyAccepted], ["Received now", g.receivedQuantity],
              ["Accepted", g.acceptedQuantity], ["Rejected", g.rejectedQuantity]].map(([k, v]) => (
              <div key={k as string} className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{k}</div><div className="text-xl font-semibold tabular-nums">{v}</div></div>
            ))}
          </div>
          {g.rejectionReason && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800"><b>Rejected:</b> {g.rejectionReason}</p>}
          {g.notes && <p className="mt-3 text-sm text-slate-600"><b>Notes:</b> {g.notes}</p>}
          <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {rows.map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="mt-0.5">{v}</dd></div>)}
          </dl>
        </Card>
        <Card title="Invoice match">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt>Accepted value</dt><dd className="tabular-nums">{money(g.acceptedValue)}</dd></div>
            <div className="text-xs text-slate-400">{g.acceptedQuantity} × {money(g.unitCost)} (PO landed cost)</div>
            <div className="flex justify-between"><dt>Invoice {g.invoiceNumber ?? ""}</dt><dd className="tabular-nums">{g.invoiceAmount != null ? money(g.invoiceAmount) : "—"}</dd></div>
            <div className="flex justify-between border-t border-slate-100 pt-3"><dt>Result</dt><dd><StatusBadge status={g.invoiceMatch} /></dd></div>
          </dl>
          <p className="mt-3 text-xs text-slate-500">PO, GRN and invoice must agree (within 1%) before Accounts releases payment.</p>
        </Card>
      </div>
    </>
  );
}
