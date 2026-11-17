"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import type { Category, StockRow, Vendor, VendorReports } from "@/lib/types";

export default function CategoriesPage() {
  const { data: categories, error, reload } = useApi<Category[]>("/categories");
  const { data: vendors } = useApi<Vendor[]>("/vendors");
  const { data: stock } = useApi<StockRow[]>("/stock");
  const { data: reports } = useApi<VendorReports>("/vendors/reports");
  const act = useAction();
  const [editing, setEditing] = useState<{ id?: string; name: string; description: string } | null>(null);

  const usage = useMemo(() => {
    const m: Record<string, { vendors: number; active: number; items: number }> = {};
    for (const c of categories ?? []) m[c.id] = { vendors: 0, active: 0, items: 0 };
    for (const v of vendors ?? []) for (const c of v.categoryIds) if (m[c]) { m[c].vendors++; if (v.status === "ACTIVE") m[c].active++; }
    for (const r of stock ?? []) if (m[r.item.categoryId]) m[r.item.categoryId].items++;
    return m;
  }, [categories, vendors, stock]);

  if (error) return <ErrorBox message={error} />;
  if (!categories) return <Loading />;
  const min = reports?.minQuotesRequired ?? 3;

  const save = async () => {
    if (!editing) return;
    const body = { name: editing.name, description: editing.description };
    const ok = await act.run(() => (editing.id ? api.put(`/categories/${editing.id}`, body) : api.post("/categories", body)));
    if (ok) { setEditing(null); reload(); }
  };
  const remove = async (c: Category) => {
    if (await act.run(() => api.del(`/categories/${c.id}`))) reload();
  };

  return (
    <>
      <PageHeader title="Categories" subtitle="What the school buys. Vendors register against categories, and RFQs go to the active vendors in a category."
        actions={<button className="btn-primary" onClick={() => setEditing({ name: "", description: "" })}>+ New category</button>} />
      <ErrorBox message={act.error} onClose={() => act.setError(null)} />
      <Card bodyClass="p-0">
        {categories.length === 0 ? <Empty>No categories yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-raised">
                <tr><th className="th">Category</th><th className="th text-right">Active vendors</th><th className="th text-right">All vendors</th><th className="th text-right">Items</th><th className="th">Coverage</th><th className="th" /></tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {categories.map((c) => {
                  const u = usage[c.id] ?? { vendors: 0, active: 0, items: 0 };
                  return (
                    <tr key={c.id}>
                      <td className="td"><div className="font-medium text-ink">{c.name}</div><div className="text-xs text-ink-mute">{c.description || "—"}</div></td>
                      <td className="td text-right tabular-nums">
                        <Link href={`/vendors?category=${c.id}&status=ACTIVE`} className="hover:text-poster">{u.active}</Link>
                      </td>
                      <td className="td text-right tabular-nums"><Link href={`/vendors?category=${c.id}`} className="hover:text-poster">{u.vendors}</Link></td>
                      <td className="td text-right tabular-nums">{u.items}</td>
                      <td className="td">
                        {u.active >= min ? <Badge tone="green">OK</Badge>
                          : <Badge tone={u.active === 0 ? "red" : "amber"}>{u.active === 0 ? "No active vendor" : `Below ${min} for RFQs`}</Badge>}
                      </td>
                      <td className="td text-right">
                        <div className="flex justify-end gap-1">
                          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing({ id: c.id, name: c.name, description: c.description ?? "" })}>Edit</button>
                          <button className="btn-ghost px-2 py-1 text-xs text-danger" disabled={u.vendors + u.items > 0}
                            title={u.vendors + u.items > 0 ? "In use by vendors or items" : "Delete category"} onClick={() => remove(c)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-xs text-ink-mute">Policy needs at least {min} quotes per purchase, so a category with fewer active vendors will always need a justification. Invite more suppliers for those.</p>

      <Modal open={!!editing} title={editing?.id ? "Edit category" : "New category"} onClose={() => setEditing(null)}
        footer={<><button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="btn-primary" disabled={act.busy || !editing?.name.trim()} onClick={save}>Save</button></>}>
        {editing && (
          <div className="space-y-3">
            <Field label="Name *"><input className="input" autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Description"><input className="input" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="e.g. Text books, reference books, periodicals" /></Field>
          </div>
        )}
      </Modal>
    </>
  );
}
