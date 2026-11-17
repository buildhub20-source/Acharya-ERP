"use client";

import Link from "next/link";
import { Card, Empty, ErrorBox, Loading, PageHeader, StatusBadge } from "@/components/ui";
import { useUser } from "@/components/UserContext";
import { date } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { PurchaseRequest } from "@/lib/types";

export default function ApprovalsPage() {
  const { user } = useUser();
  const { data: pending, error } = useApi<PurchaseRequest[]>("/purchase-requests?status=PENDING_APPROVAL");
  const { data: review } = useApi<PurchaseRequest[]>("/purchase-requests?status=UNDER_REVIEW");
  const { data: sentBack } = useApi<PurchaseRequest[]>("/purchase-requests?status=SENT_BACK");
  if (error) return <ErrorBox message={error} />;
  if (!pending || !review || !sentBack) return <Loading />;

  const official = user.role === "OFFICIAL";
  return (
    <>
      <PageHeader title="Approvals" subtitle={official ? "Second-level sign-off queue" : "Requests waiting on a decision"} />
      <div className="space-y-6">
        <Section title="Awaiting higher official (level 2)" rows={pending} hint="Nothing waiting for sign-off." />
        <Section title="Awaiting manager review (level 1)" rows={[...sentBack, ...review]} hint="No quotes waiting for review." />
      </div>
    </>
  );
}

function Section({ title, rows, hint }: { title: string; rows: PurchaseRequest[]; hint: string }) {
  return (
    <Card title={`${title} (${rows.length})`} bodyClass="p-0">
      {rows.length === 0 ? <Empty>{hint}</Empty> : (
        <ul className="divide-y divide-slate-100">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={`/procurement/${p.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50">
                <div>
                  <div className="font-medium text-slate-900">{p.title}</div>
                  <div className="text-xs text-slate-500">{p.number} · {p.department} · needed by {date(p.dueDate)}</div>
                  {p.selectionJustification && <div className="mt-1 text-xs text-slate-600">“{p.selectionJustification}”</div>}
                </div>
                <StatusBadge status={p.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
