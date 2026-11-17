"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, Empty, ErrorBox, Field, Modal } from "@/components/ui";
import { useUser } from "@/components/UserContext";
import { api } from "@/lib/api";
import { date, money } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import type { Category, Item, Vendor } from "@/lib/types";

/** Items this vendor supplies, with typical price, MOQ and lead time (rate card). */
export default function CatalogueTab({ vendor, categories, onChange }: { vendor: Vendor; categories: Category[]; onChange: (v: Vendor) => void }) {
  const { user } = useUser();
  const { data: items } = useApi<Item[]>("/items");
  const act = useAction();
  const [edit, setEdit] = useState<{ itemId: string; typicalPrice: string; minOrderQuantity: string; leadTimeDays: string; isNew: boolean } | null>(null);

  const eligible = (items ?? []).filter((i) => vendor.categoryIds.includes(i.categoryId));
  const listed = new Set(vendor.catalogue.map((c) => c.itemId));
  const catName = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  const save = async () => {
    if (!edit) return;
    const res = await act.run(() => api.post<Vendor>(`/vendors/${vendor.id}/catalogue?actor=${encodeURIComponent(user.name)}`, {
      itemId: edit.itemId, typicalPrice: Number(edit.typicalPrice),
      minOrderQuantity: edit.minOrderQuantity ? Number(edit.minOrderQuantity) : null,
      leadTimeDays: edit.leadTimeDays ? Number(edit.leadTimeDays) : null,
    }));
    if (res) { onChange(res); setEdit(null); }
  };
  const remove = async (itemId: string) => {
    const res = await act.run(() => api.del<Vendor>(`/vendors/${vendor.id}/catalogue/${itemId}?actor=${encodeURIComponent(user.name)}`));
    if (res) onChange(res);
  };

  return (
    <Card title="Catalogue · items supplied" bodyClass="p-0"
      actions={<button className="btn-secondary px-2.5 py-1 text-xs" disabled={eligible.length === listed.size}
        onClick={() => setEdit({ itemId: eligible.find((i) => !listed.has(i.id))?.id ?? "", typicalPrice: "", minOrderQuantity: "", leadTimeDays: String(vendor.leadTimeDays ?? ""), isNew: true })}>+ Add item</button>}>
      <div className="px-5 pt-4"><ErrorBox message={act.error} onClose={() => act.setError(null)} /></div>
      {vendor.catalogue.length === 0 ? <Empty>No items mapped yet. Map the items this vendor supplies so they are suggested first on matching purchase requests.</Empty> : (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-raised">
              <tr><th className="th">Item</th><th className="th text-right">Typical price</th><th className="th text-right">vs last purchase</th>
                <th className="th text-right">Min order</th><th className="th text-right">Lead time</th><th className="th">Updated</th><th className="th" /></tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {vendor.catalogue.map((c) => {
                const item = items?.find((i) => i.id === c.itemId);
                const diff = item?.lastPurchasePrice ? ((c.typicalPrice - item.lastPurchasePrice) / item.lastPurchasePrice) * 100 : null;
                return (
                  <tr key={c.itemId}>
                    <td className="td"><Link href={`/inventory/${c.itemId}`} className="font-medium text-ink hover:text-poster">{c.itemName}</Link>
                      <div className="text-xs text-ink-mute">{item ? catName[item.categoryId] : ""}</div></td>
                    <td className="td text-right tabular-nums">{money(c.typicalPrice)} <span className="text-xs text-ink-mute">/ {c.unit}</span></td>
                    <td className={`td text-right text-xs tabular-nums ${diff == null ? "text-ink-faint" : diff > 5 ? "text-danger" : diff < -5 ? "text-ok" : "text-ink-mute"}`}>
                      {diff == null ? "—" : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`}
                    </td>
                    <td className="td text-right tabular-nums">{c.minOrderQuantity ?? "—"}</td>
                    <td className="td text-right tabular-nums">{c.leadTimeDays != null ? `${c.leadTimeDays}d` : "—"}</td>
                    <td className="td text-xs text-ink-mute">{date(c.updatedOn)}</td>
                    <td className="td text-right">
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEdit({ itemId: c.itemId, typicalPrice: String(c.typicalPrice), minOrderQuantity: String(c.minOrderQuantity ?? ""), leadTimeDays: String(c.leadTimeDays ?? ""), isNew: false })}>Edit</button>
                        <button className="btn-ghost px-2 py-1 text-xs text-danger" disabled={act.busy} onClick={() => remove(c.itemId)}>Remove</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!edit} title={edit?.isNew ? "Add catalogue item" : "Edit catalogue item"} onClose={() => setEdit(null)}
        footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
          <button className="btn-primary" disabled={act.busy || !edit?.itemId || !Number(edit?.typicalPrice)} onClick={save}>Save</button></>}>
        {edit && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Item *" className="sm:col-span-2" hint="Only items in this vendor's categories are listed">
              <select className="input" value={edit.itemId} disabled={!edit.isNew} onChange={(e) => setEdit({ ...edit, itemId: e.target.value })}>
                {eligible.filter((i) => !edit.isNew || !listed.has(i.id) || i.id === edit.itemId).map((i) => (
                  <option key={i.id} value={i.id}>{i.name} ({i.sku}) · last bought {money(i.lastPurchasePrice)}</option>
                ))}
              </select>
            </Field>
            <Field label="Typical price (₹, before tax) *"><input className="input" type="number" min={0} step="0.01" value={edit.typicalPrice} onChange={(e) => setEdit({ ...edit, typicalPrice: e.target.value })} /></Field>
            <Field label="Minimum order quantity"><input className="input" type="number" min={1} value={edit.minOrderQuantity} onChange={(e) => setEdit({ ...edit, minOrderQuantity: e.target.value })} /></Field>
            <Field label="Lead time (days)"><input className="input" type="number" min={0} value={edit.leadTimeDays} onChange={(e) => setEdit({ ...edit, leadTimeDays: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </Card>
  );
}
