"use client";

import Link from "next/link";
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, ScoreBar, Stars, Stat } from "@/components/ui";
import { useUser } from "@/components/UserContext";
import { label, money, timeAgo } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Dashboard, PrStatus } from "@/lib/types";

const PIPELINE: { status: PrStatus; label: string }[] = [
  { status: "DRAFT", label: "Draft" },
  { status: "RFQ_SENT", label: "RFQ sent" },
  { status: "COLLECTING_QUOTES", label: "Collecting quotes" },
  { status: "UNDER_REVIEW", label: "Manager review" },
  { status: "PENDING_APPROVAL", label: "Official approval" },
  { status: "PO_ISSUED", label: "PO issued" },
];

export default function DashboardPage() {
  const { data, error, loading } = useApi<Dashboard>("/dashboard");
  const { user } = useUser();

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  return (
    <>
      <PageHeader
        title={`Good day, ${user.title}`}
        subtitle="Inventory procurement at a glance"
        actions={
          <>
            <Link href="/vendors/new" className="btn-secondary">+ Add vendor</Link>
            <Link href="/procurement/new" className="btn-primary">+ New purchase request</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active vendors" value={data.vendorCounts.ACTIVE ?? 0} hint={`${data.totalVendors} in vendor master`} href="/vendors" />
        <Stat label="Open requests" value={data.openRequests} tone="indigo" hint="Not yet ordered" href="/procurement" />
        <Stat label="Pending approvals" value={data.pendingApprovals} tone="amber" hint="Awaiting higher official" href="/approvals" />
        <Stat label="PO value" value={money(data.poValue, true)} tone="emerald"
          hint={`${data.poCount} PO(s) · saved ~${money(data.estimatedSavings, true)} vs avg quote`} href="/purchase-orders" />
        <Stat label="Stock value" value={money(data.stockValue, true)} hint="At average cost" href="/inventory" />
        <Stat label="Awaiting delivery" value={data.pendingDeliveries} tone="indigo"
          hint={data.overdueDeliveries ? `${data.overdueDeliveries} overdue` : "None overdue"} href="/inventory/receipts" />
        <Stat label="Reorder alerts" value={data.reorderItems.length} tone={data.reorderItems.length ? "rose" : "slate"}
          hint="Low stock, nothing on order" href="/inventory?status=ATTENTION" />
      </div>

      <Card title="Procurement pipeline" className="mt-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {PIPELINE.map((p, i) => (
            <Link key={p.status} href={`/procurement?status=${p.status}`}
              className="relative rounded-lg border border-slate-200 p-3 transition hover:border-indigo-300 hover:bg-indigo-50/40">
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Step {i + 1}</div>
              <div className="text-sm font-medium text-slate-700">{p.label}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{data.prCounts[p.status] ?? 0}</div>
            </Link>
          ))}
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Needs attention" className="lg:col-span-1">
          <ul className="space-y-3 text-sm">
            {data.pendingVendorVerification > 0 && (
              <li className="flex items-center justify-between">
                <Link href="/vendors?status=PENDING_VERIFICATION" className="text-slate-700 hover:text-indigo-600">
                  Vendors awaiting verification
                </Link>
                <Badge tone="amber">{data.pendingVendorVerification}</Badge>
              </li>
            )}
            {data.pendingBankChanges.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2">
                <Link href={`/vendors/${b.id}`} className="text-slate-700 hover:text-indigo-600">
                  Bank change: {b.name}
                </Link>
                <Badge tone="red">Payments on hold</Badge>
              </li>
            ))}
            {data.expiringDocuments.map((d) => (
              <li key={d.vendorId + d.type} className="flex items-center justify-between gap-2">
                <Link href={`/vendors/${d.vendorId}`} className="text-slate-700 hover:text-indigo-600">
                  {d.vendorName}: {label(d.type)}
                </Link>
                <Badge tone={d.daysToExpiry < 0 ? "red" : "amber"}>
                  {d.daysToExpiry < 0 ? `Expired ${-d.daysToExpiry}d ago` : `${d.daysToExpiry}d left`}
                </Badge>
              </li>
            ))}
            {data.reorderItems.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <Link href={`/inventory/${r.id}`} className="text-slate-700 hover:text-indigo-600">Low stock: {r.name}</Link>
                <Badge tone={r.onHand === 0 ? "red" : "amber"}>{r.onHand} {r.unit} left</Badge>
              </li>
            ))}
            {data.pendingVendorVerification === 0 && data.pendingBankChanges.length === 0 && data.expiringDocuments.length === 0 && data.reorderItems.length === 0 && (
              <Empty>All clear 🎉</Empty>
            )}
          </ul>
        </Card>

        <Card title="Recent activity" className="lg:col-span-2" bodyClass="p-0">
          <ul className="divide-y divide-slate-100">
            {data.recentActivity.map((a, i) => (
              <li key={i} className="flex items-start gap-3 px-5 py-3">
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-400" />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="text-slate-800">
                    <span className="font-medium">{label(a.action)}</span>
                    <span className="text-slate-500"> · </span>
                    <Link href={`/procurement/${a.prId}`} className="text-indigo-600 hover:underline">{a.prNumber}</Link>
                    <span className="text-slate-500"> {a.prTitle}</span>
                  </div>
                  <div className="truncate text-xs text-slate-500">{a.details} — {a.by}</div>
                </div>
                <div className="shrink-0 text-xs text-slate-400">{timeAgo(a.at)}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Top performing vendors" className="mt-6" bodyClass="p-0"
        actions={<Link href="/vendors" className="text-sm text-indigo-600 hover:underline">View all</Link>}>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-slate-50"><tr><th className="th">Vendor</th><th className="th">Score</th><th className="th">Rating</th><th className="th">Response rate</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.topVendors.map((v) => (
                <tr key={v.id}>
                  <td className="td"><Link href={`/vendors/${v.id}`} className="font-medium text-slate-800 hover:text-indigo-600">{v.name}</Link></td>
                  <td className="td"><ScoreBar value={v.score} /></td>
                  <td className="td"><Stars value={v.rating} /></td>
                  <td className="td tabular-nums">{v.responseRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
