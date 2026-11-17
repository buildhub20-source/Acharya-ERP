"use client";

import Link from "next/link";
import { Badge, Card, Empty, ErrorBox, Loading, Stat, StatusBadge } from "@/components/ui";
import { date, label, money } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { VendorActivity } from "@/lib/types";

const OUTCOME_TONE: Record<string, "green" | "gray" | "red" | "blue" | "indigo" | "amber"> = {
  WON: "green", NOT_SELECTED: "gray", NO_RESPONSE: "red", AWAITING_QUOTE: "amber", UNDER_EVALUATION: "indigo",
  REQUOTED: "gray", CANCELLED: "gray",
};

/** The vendor's trading history with the school: RFQs, quotes, orders and deliveries. */
export default function ActivityTab({ vendorId }: { vendorId: string }) {
  const { data: a, error } = useApi<VendorActivity>(`/vendors/${vendorId}/activity`);
  if (error) return <ErrorBox message={error} />;
  if (!a) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="RFQs received" value={a.rfqs.length} hint={`${a.quoted} quoted`} />
        <Stat label="Win rate" value={`${a.winRatePct}%`} tone="indigo" hint={`${a.won} won`} />
        <Stat label="Total spend" value={money(a.totalSpend, true)} tone="emerald" hint={`${a.orders.length} purchase order(s)`} />
        <Stat label="Open order value" value={money(a.openOrderValue, true)} hint="Still to be delivered" />
      </div>

      <Card title="RFQ & quote history" bodyClass="p-0">
        {a.rfqs.length === 0 ? <Empty>No RFQs sent to this vendor yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-raised">
                <tr><th className="th">Request</th><th className="th">Sent</th><th className="th text-right">Quoted (landed)</th><th className="th">Rank</th><th className="th">Outcome</th></tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {a.rfqs.map((h) => (
                  <tr key={h.rfqId}>
                    <td className="td">
                      <Link href={`/procurement/${h.purchaseRequestId}`} className="font-medium text-ink hover:text-poster">{h.title ?? h.purchaseRequestNumber}</Link>
                      <div className="text-xs text-ink-mute">{h.reference} · {h.purchaseRequestNumber}</div>
                    </td>
                    <td className="td text-xs">{date(h.sentAt)}</td>
                    <td className="td text-right tabular-nums">{h.quotedAmount != null ? money(h.quotedAmount) : <span className="text-ink-faint">—</span>}</td>
                    <td className="td tabular-nums">{h.rank ? <span className={h.rank === 1 ? "font-semibold text-ok" : ""}>{h.rank === 1 ? "L1" : `L${h.rank}`} of {h.competitors}</span> : "—"}</td>
                    <td className="td"><Badge tone={OUTCOME_TONE[h.outcome] ?? "gray"}>{label(h.outcome)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Purchase orders" bodyClass="p-0">
          {a.orders.length === 0 ? <Empty>No orders yet.</Empty> : (
            <ul className="divide-y divide-rule">
              {a.orders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <div>
                    <Link href={`/procurement/${o.purchaseRequestId}`} className="font-medium text-ink hover:text-poster">{o.number}</Link>
                    <div className="text-xs text-ink-mute">{o.title} · {o.acceptedQuantity}/{o.orderedQuantity} {o.unit} received</div>
                  </div>
                  <span className="flex items-center gap-2"><span className="tabular-nums">{money(o.amount, true)}</span><StatusBadge status={o.status} /></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Deliveries (GRN)" bodyClass="p-0">
          {a.receipts.length === 0 ? <Empty>No deliveries yet.</Empty> : (
            <ul className="divide-y divide-rule">
              {a.receipts.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <div>
                    <Link href={`/inventory/receipts/${g.id}`} className="font-medium text-ink hover:text-poster">{g.number}</Link>
                    <div className="text-xs text-ink-mute">{date(g.receivedDate)} · {g.acceptedQuantity} accepted{g.rejectedQuantity ? `, ${g.rejectedQuantity} rejected` : ""}</div>
                  </div>
                  <span className="flex gap-1.5">{g.onTime ? <Badge tone="green">On time</Badge> : <Badge tone="red">Late</Badge>}<StatusBadge status={g.invoiceMatch} /></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
