"use client";

import Link from "next/link";
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, ScoreBar, Stars, Stat, StatusBadge } from "@/components/ui";
import { label, money } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Category, Vendor, VendorReports } from "@/lib/types";
import { downloadVendorsCsv } from "@/lib/csv";

export default function VendorReportsPage() {
  const { data: r, error } = useApi<VendorReports>("/vendors/reports");
  const { data: vendors } = useApi<Vendor[]>("/vendors");
  const { data: categories } = useApi<Category[]>("/categories");
  if (error) return <ErrorBox message={error} />;
  if (!r) return <Loading />;

  const thin = r.coverage.filter((c) => c.belowMinimum);
  const top = r.spend[0];

  return (
    <>
      <PageHeader title="Vendor reports" subtitle="Spend, dependency, category coverage and vendor performance"
        actions={<button className="btn-secondary" disabled={!vendors} onClick={() => vendors && downloadVendorsCsv(vendors, Object.fromEntries((categories ?? []).map((c) => [c.id, c.name])))}>Export vendor directory (CSV)</button>} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Spend (POs)" value={money(r.totalSpend, true)} tone="emerald" hint={`${r.spend.reduce((s, x) => s + x.poCount, 0)} purchase orders`} />
        <Stat label="Vendors used" value={r.spend.length} hint={`of ${r.statusCounts.ACTIVE ?? 0} active`} />
        <Stat label="Largest share" value={top ? `${top.sharePct}%` : "—"} tone={top?.concentrated ? "rose" : "slate"} hint={top?.vendorName} />
        <Stat label="Thin categories" value={thin.length} tone={thin.length ? "amber" : "slate"} hint={`Fewer than ${r.minQuotesRequired} active vendors`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Spend by vendor" bodyClass="p-0">
          {r.spend.length === 0 ? <Empty>No purchase orders yet.</Empty> : (
            <ul className="divide-y divide-rule">
              {r.spend.map((s) => (
                <li key={s.vendorId} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <Link href={`/vendors/${s.vendorId}`} className="font-medium text-ink hover:text-poster">{s.vendorName}</Link>
                    <span className="tabular-nums text-ink-soft">{money(s.spend, true)} · {s.poCount} PO</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised-2">
                      <div className={`h-full ${s.concentrated ? "bg-danger" : "bg-poster"}`} style={{ width: `${s.sharePct}%` }} />
                    </div>
                    <span className="w-12 text-right text-xs tabular-nums text-ink-mute">{s.sharePct}%</span>
                  </div>
                  {s.concentrated && <div className="mt-1 text-[11px] text-danger">Over {r.concentrationThresholdPct}% of spend: dependency risk</div>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Category coverage" bodyClass="p-0">
          <ul className="divide-y divide-rule">
            {r.coverage.map((c) => (
              <li key={c.categoryId} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <Link href={`/vendors?category=${c.categoryId}`} className="text-ink hover:text-poster">{c.categoryName}</Link>
                <span className="flex items-center gap-3">
                  <span className="text-xs tabular-nums text-ink-mute">{c.active} active / {c.total}</span>
                  {c.belowMinimum ? <Badge tone={c.active === 0 ? "red" : "amber"}>{c.active === 0 ? "None" : "Thin"}</Badge> : <Badge tone="green">OK</Badge>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Vendor scorecard" className="mt-6" bodyClass="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-raised">
              <tr>
                <th className="th">#</th><th className="th">Vendor</th><th className="th">Score</th><th className="th text-right">Response</th>
                <th className="th text-right">Avg reply</th><th className="th text-right">On time</th><th className="th text-right">Quality</th>
                <th className="th">Rating</th><th className="th text-right">Wins</th><th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {r.scorecard.map((s, i) => (
                <tr key={s.vendorId}>
                  <td className="td font-display text-lg text-ink-mute">{i + 1}</td>
                  <td className="td"><Link href={`/vendors/${s.vendorId}`} className="font-medium text-ink hover:text-poster">{s.vendorName}</Link></td>
                  <td className="td"><ScoreBar value={s.score} /></td>
                  <td className="td text-right tabular-nums">{s.responseRatePct}%</td>
                  <td className="td text-right tabular-nums">{s.avgResponseHours}h</td>
                  <td className={`td text-right tabular-nums ${s.onTimePct < 80 ? "text-danger" : ""}`}>{s.onTimePct}%</td>
                  <td className={`td text-right tabular-nums ${s.qualityPct < 90 ? "text-warn" : ""}`}>{s.qualityPct}%</td>
                  <td className="td"><Stars value={s.rating} /></td>
                  <td className="td text-right tabular-nums">{s.quotesWon}</td>
                  <td className="td"><StatusBadge status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Vendors by status" className="mt-6">
        <div className="flex flex-wrap gap-3">
          {Object.entries(r.statusCounts).map(([k, n]) => (
            <Link key={k} href={`/vendors?status=${k}`} className="rounded-md bg-raised px-3 py-2 text-sm hover:bg-raised-2">
              <div className="text-[11px] uppercase tracking-wider text-ink-mute">{label(k)}</div>
              <div className="font-display text-2xl text-ink">{n}</div>
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}
