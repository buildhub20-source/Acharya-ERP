"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Card, Empty, ErrorBox, Loading, PageHeader, ScoreBar, Stars, StatusBadge } from "@/components/ui";
import { downloadVendorsCsv } from "@/lib/csv";
import { label } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Category, Vendor, VendorStatus } from "@/lib/types";

const STATUSES: VendorStatus[] = ["ACTIVE", "PENDING_VERIFICATION", "INVITED", "SENT_BACK", "SUSPENDED", "BLACKLISTED", "REJECTED", "INACTIVE"];

function VendorList() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState("");
  const category = params.get("category") ?? "";
  const status = params.get("status") ?? "";

  const query = new URLSearchParams();
  if (category) query.set("category", category);
  if (status) query.set("status", status);
  const { data: vendors, error, loading } = useApi<Vendor[]>(`/vendors?${query}`);
  const { data: categories } = useApi<Category[]>("/categories");
  const catName = useMemo(() => Object.fromEntries((categories ?? []).map((c) => [c.id, c.name])), [categories]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.replace(`/vendors?${next}`);
  };

  const filtered = (vendors ?? []).filter((v) => {
    const s = q.trim().toLowerCase();
    return !s || [v.legalName, v.tradeName, v.code, v.city, v.gstin].some((x) => x?.toLowerCase().includes(s));
  });

  return (
    <>
      <PageHeader
        title="Vendors"
        subtitle="Verified supplier master: categories, contacts, compliance and performance"
        actions={<>
          <button className="btn-secondary" disabled={!filtered.length} onClick={() => downloadVendorsCsv(filtered, catName)}>Export CSV</button>
          <Link href="/vendors/new" className="btn-primary">+ Add / invite vendor</Link>
        </>}
      />
      <ErrorBox message={error} />

      <div className="mb-4 flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder="Search name, code, city, GSTIN…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={category} onChange={(e) => setFilter("category", e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input w-auto" value={status} onChange={(e) => setFilter("status", e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
      </div>

      <Card bodyClass="p-0">
        {loading && !vendors ? <Loading /> : filtered.length === 0 ? <Empty>No vendors match these filters.</Empty> : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-raised">
                <tr>
                  <th className="th">Vendor</th><th className="th">Categories</th><th className="th">Contact</th>
                  <th className="th">Status</th><th className="th">Score</th><th className="th">Rating</th><th className="th">Portal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {filtered.map((v) => (
                  <tr key={v.id} className="cursor-pointer hover:bg-raised" onClick={() => router.push(`/vendors/${v.id}`)}>
                    <td className="td">
                      <div className="font-medium text-ink">{v.displayName}</div>
                      <div className="text-xs text-ink-mute">{v.code} · {v.city} · {label(v.type)}</div>
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1">
                        {v.categoryIds.map((c) => (
                          <span key={c} className="rounded bg-raised-2 px-1.5 py-0.5 text-xs text-ink-soft">{catName[c] ?? c}</span>
                        ))}
                      </div>
                    </td>
                    <td className="td">
                      <div>{v.contacts[0]?.name}</div>
                      <div className="text-xs text-ink-mute">{v.contacts[0]?.phone}</div>
                    </td>
                    <td className="td">
                      <StatusBadge status={v.status} />
                      {v.pendingBankChange && <div className="mt-1 text-[11px] text-danger">Bank change pending</div>}
                    </td>
                    <td className="td"><ScoreBar value={v.performance.overallScore} /></td>
                    <td className="td"><Stars value={v.performance.manualRating} /></td>
                    <td className="td text-xs">{v.portalEnabled ? "✓ Enabled" : <span className="text-ink-mute">—</span>}</td>
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

export default function VendorsPage() {
  return <Suspense fallback={<Loading />}><VendorList /></Suspense>;
}
