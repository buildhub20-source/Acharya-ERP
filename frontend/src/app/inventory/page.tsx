"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { AdjustDialog, IssueDialog } from "@/components/inventory/StockActions";
import { Card, Empty, ErrorBox, Loading, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { money } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Category, Item, StockRow } from "@/lib/types";

export default function StockPage() {
  return <Suspense fallback={<Loading />}><StockList /></Suspense>;
}

function StockList() {
  const router = useRouter();
  const params = useSearchParams();
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [q, setQ] = useState("");
  const query = new URLSearchParams();
  if (category) query.set("category", category);
  if (status) query.set("status", status);
  const { data, error, loading, reload } = useApi<StockRow[]>(`/stock?${query}`);
  const { data: categories } = useApi<Category[]>("/categories");
  const catName = useMemo(() => Object.fromEntries((categories ?? []).map((c) => [c.id, c.name])), [categories]);
  const [issuing, setIssuing] = useState<Item | null>(null);
  const [adjusting, setAdjusting] = useState<Item | null>(null);

  const rows = (data ?? []).filter((r) => {
    const s = q.trim().toLowerCase();
    return !s || r.item.name.toLowerCase().includes(s) || r.item.sku.toLowerCase().includes(s);
  });
  const all = data ?? [];
  const value = all.reduce((s, r) => s + r.item.stockValue, 0);
  const reorder = all.filter((r) => r.needsReorder);

  return (
    <>
      <PageHeader title="Stock" subtitle="On-hand quantity, reorder levels and value for every item in the store"
        actions={<>
          <Link href="/inventory/receipts" className="btn-secondary">Receive goods</Link>
          <Link href="/inventory/movements" className="btn-secondary">Stock ledger</Link>
        </>} />
      <ErrorBox message={error} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Items" value={all.length} hint={`${all.filter((r) => r.item.onHand > 0).length} in stock`} />
        <Stat label="Stock value" value={money(value, true)} tone="emerald" hint="At weighted average cost" />
        <Stat label="Low / out" value={all.filter((r) => r.item.stockStatus !== "OK").length} tone="amber" hint="At or below reorder level" />
        <Stat label="Need reorder" value={reorder.length} tone="rose" hint="Low and nothing on order" />
      </div>

      {reorder.length > 0 && (
        <div className="card mb-6 border-amber-200 bg-amber-50/60 p-4">
          <div className="mb-2 text-sm font-semibold text-amber-900">Reorder alerts</div>
          <ul className="space-y-2">
            {reorder.map((r) => (
              <li key={r.item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <Link href={`/inventory/${r.item.id}`} className="font-medium text-slate-800 hover:text-indigo-600">{r.item.name}</Link>
                  <span className="text-slate-600">: {r.item.onHand} {r.item.unit} left (reorder at {r.item.reorderLevel})</span>
                </span>
                <Link className="btn-secondary px-2.5 py-1 text-xs"
                  href={`/procurement/new?itemId=${r.item.id}&qty=${r.item.reorderQuantity || r.item.reorderLevel * 2}`}>
                  Raise purchase request ({r.item.reorderQuantity} {r.item.unit})
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder="Search item or SKU…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Stock status">
          <option value="">All stock levels</option>
          <option value="ATTENTION">Low or out</option>
          <option value="OK">OK</option><option value="LOW">Low</option><option value="OUT">Out</option>
        </select>
      </div>

      <Card bodyClass="p-0">
        {loading && !data ? <Loading /> : rows.length === 0 ? <Empty>No items match.</Empty> : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Item</th><th className="th">Category</th><th className="th text-right">On hand</th>
                  <th className="th text-right">Reorder at</th><th className="th text-right">On order</th>
                  <th className="th text-right">Avg cost</th><th className="th text-right">Value</th><th className="th">Status</th><th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ item: i, onOrder, openRequest }) => (
                  <tr key={i.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/inventory/${i.id}`)}>
                    <td className="td">
                      <div className="font-medium text-slate-900">{i.name}</div>
                      <div className="text-xs text-slate-500">{i.sku} · {i.location ?? "—"}</div>
                    </td>
                    <td className="td">{catName[i.categoryId] ?? i.categoryId}</td>
                    <td className="td text-right font-semibold tabular-nums">{i.onHand} <span className="text-xs font-normal text-slate-400">{i.unit}</span></td>
                    <td className="td text-right tabular-nums text-slate-500">{i.reorderLevel || "—"}</td>
                    <td className="td text-right tabular-nums">
                      {onOrder || <span className="text-slate-300">—</span>}
                      {openRequest && (
                        <Link href={`/procurement/${openRequest.id}`} onClick={(e) => e.stopPropagation()} className="block text-[11px] text-indigo-600 hover:underline">
                          {openRequest.number} in progress
                        </Link>
                      )}
                    </td>
                    <td className="td text-right tabular-nums">{money(i.avgUnitCost)}</td>
                    <td className="td text-right tabular-nums">{money(i.stockValue, true)}</td>
                    <td className="td"><StatusBadge status={i.stockStatus} /></td>
                    <td className="td text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <button className="btn-secondary px-2.5 py-1 text-xs" disabled={i.onHand === 0} onClick={() => setIssuing(i)}>Issue</button>
                        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setAdjusting(i)}>Adjust</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <IssueDialog item={issuing} onClose={() => setIssuing(null)} onDone={() => { setIssuing(null); reload(); }} />
      <AdjustDialog item={adjusting} onClose={() => setAdjusting(null)} onDone={() => { setAdjusting(null); reload(); }} />
    </>
  );
}
