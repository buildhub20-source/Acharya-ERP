"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, Empty, ErrorBox, Loading, PageHeader, StatusBadge } from "@/components/ui";
import { dateTime, label, money } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { MovementType, StockMovement } from "@/lib/types";

const TYPES: (MovementType | "")[] = ["", "RECEIPT", "ISSUE", "ADJUSTMENT", "OPENING"];

export default function MovementsPage() {
  const [type, setType] = useState<MovementType | "">("");
  const { data, error } = useApi<StockMovement[]>(`/stock/movements${type ? `?type=${type}` : ""}`);
  if (error) return <ErrorBox message={error} />;

  const issuedByDept = (data ?? []).filter((m) => m.type === "ISSUE").reduce<Record<string, number>>((acc, m) => {
    acc[m.department ?? "—"] = (acc[m.department ?? "—"] ?? 0) + Math.abs(m.value);
    return acc;
  }, {});

  return (
    <>
      <PageHeader title="Stock ledger" subtitle="Every receipt, issue and adjustment, newest first. Entries are append-only." />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TYPES.map((t) => (
          <button key={t || "all"} onClick={() => setType(t)}
            className={`rounded-full px-3 py-1 text-xs ${type === t ? "bg-indigo-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
            {t ? label(t) : "All"}
          </button>
        ))}
      </div>

      {(type === "" || type === "ISSUE") && Object.keys(issuedByDept).length > 0 && (
        <Card title="Consumption by department (issues shown)" className="mb-6">
          <div className="flex flex-wrap gap-3">
            {Object.entries(issuedByDept).sort((a, b) => b[1] - a[1]).map(([d, v]) => (
              <div key={d} className="rounded-lg bg-slate-50 px-3 py-2 text-sm"><div className="text-xs text-slate-500">{d}</div><div className="font-semibold tabular-nums">{money(v, true)}</div></div>
            ))}
          </div>
        </Card>
      )}

      <Card bodyClass="p-0">
        {!data ? <Loading /> : data.length === 0 ? <Empty>No movements.</Empty> : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-50">
                <tr><th className="th">When</th><th className="th">Item</th><th className="th">Type</th><th className="th">Reference</th><th className="th">Department / reason</th>
                  <th className="th text-right">Qty</th><th className="th text-right">Balance</th><th className="th text-right">Value</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((m) => (
                  <tr key={m.id}>
                    <td className="td whitespace-nowrap text-xs text-slate-500">{dateTime(m.at)}</td>
                    <td className="td"><Link href={`/inventory/${m.itemId}`} className="font-medium hover:text-indigo-600">{m.itemName}</Link></td>
                    <td className="td"><StatusBadge status={m.type} /></td>
                    <td className="td text-xs">{m.type === "RECEIPT" && m.referenceId ? <Link className="text-indigo-600 hover:underline" href={`/inventory/receipts/${m.referenceId}`}>{m.reference}</Link> : m.reference}</td>
                    <td className="td text-xs text-slate-600">{m.department && <span className="font-medium text-slate-700">{m.department} </span>}{m.issuedTo && `· ${m.issuedTo} `}{m.reason && <span className="text-slate-500">{m.reason}</span>}</td>
                    <td className={`td text-right font-semibold tabular-nums ${m.quantity > 0 ? "text-emerald-700" : "text-rose-600"}`}>{m.quantity > 0 ? "+" : ""}{m.quantity} <span className="text-xs font-normal text-slate-400">{m.unit}</span></td>
                    <td className="td text-right tabular-nums">{m.balanceAfter}</td>
                    <td className="td text-right tabular-nums text-xs">{money(Math.abs(m.value), true)}</td>
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
