"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Card, Empty, ErrorBox, Loading, PageHeader, StatusBadge } from "@/components/ui";
import { date, label } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { PrStatus, PurchaseRequest } from "@/lib/types";

const FILTERS: (PrStatus | "")[] = ["", "DRAFT", "RFQ_SENT", "COLLECTING_QUOTES", "UNDER_REVIEW", "SENT_BACK", "PENDING_APPROVAL", "REJECTED_REQUOTE", "PO_ISSUED", "CANCELLED"];

function RequestList() {
  const params = useSearchParams();
  const router = useRouter();
  const status = params.get("status") ?? "";
  const { data, error, loading } = useApi<PurchaseRequest[]>(`/purchase-requests${status ? `?status=${status}` : ""}`);

  return (
    <>
      <PageHeader title="Purchase requests" subtitle="From request → RFQ → quotes → approval → purchase order"
        actions={<Link href="/procurement/new" className="btn-primary">+ New purchase request</Link>} />
      <ErrorBox message={error} />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((s) => (
          <button key={s || "all"} onClick={() => router.replace(s ? `/procurement?status=${s}` : "/procurement")}
            className={`rounded-full px-3 py-1 text-xs ${status === s ? "bg-indigo-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
            {s ? label(s) : "All"}
          </button>
        ))}
      </div>
      <Card bodyClass="p-0">
        {loading && !data ? <Loading /> : !data?.length ? <Empty>No purchase requests here.</Empty> : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-50">
                <tr><th className="th">Request</th><th className="th">Department</th><th className="th">Qty</th><th className="th">Needed by</th><th className="th">Round</th><th className="th">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((p) => (
                  <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/procurement/${p.id}`)}>
                    <td className="td">
                      <div className="font-medium text-slate-900">{p.title}</div>
                      <div className="text-xs text-slate-500">{p.number} · by {p.requestedBy}</div>
                    </td>
                    <td className="td">{p.department}</td>
                    <td className="td tabular-nums">{p.totalQuantity} {p.lines[0]?.unit}</td>
                    <td className="td">{date(p.dueDate)}</td>
                    <td className="td">{p.round}</td>
                    <td className="td"><StatusBadge status={p.status} /></td>
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

export default function ProcurementPage() {
  return <Suspense fallback={<Loading />}><RequestList /></Suspense>;
}
