"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Card, ErrorBox, Field, Loading, PageHeader } from "@/components/ui";
import { useUser } from "@/components/UserContext";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import type { Category, Item, ItemDetail, PurchaseRequest } from "@/lib/types";

const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/** Reads ?itemId=&qty= (from reorder alerts) and pre-fills the form once the item has loaded. */
function Prefill() {
  const params = useSearchParams();
  const itemId = params.get("itemId");
  const { data, error } = useApi<ItemDetail>(itemId ? `/stock/${itemId}` : null);
  if (!itemId) return <NewRequestForm />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;
  return <NewRequestForm reorder={{ item: data.item, quantity: params.get("qty") ?? String(data.item.reorderQuantity || 1) }} />;
}

export default function NewPurchaseRequestPage() {
  return <Suspense fallback={<Loading />}><Prefill /></Suspense>;
}

function NewRequestForm({ reorder }: { reorder?: { item: Item; quantity: string } }) {
  const router = useRouter();
  const { user } = useUser();
  const { data: categories } = useApi<Category[]>("/categories");
  const { busy, error, setError, run } = useAction();
  const [f, setF] = useState({
    title: reorder ? `Restock: ${reorder.item.name}` : "",
    categoryId: reorder?.item.categoryId ?? "footwear",
    department: reorder ? "Stores" : "",
    dueDate: inDays(21),
    deliveryLocation: reorder?.item.location ?? "",
    budgetHead: "",
    budgetAmount: "",
  });
  const [line, setLine] = useState(reorder
    ? { itemId: reorder.item.id, description: reorder.item.name, specs: "", quantity: reorder.quantity, unit: reorder.item.unit }
    : { itemId: "", description: "", specs: "", quantity: "1", unit: "pc" });
  const { data: items } = useApi<Item[]>(`/items?category=${f.categoryId}`);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const pickItem = (id: string) => {
    const it = items?.find((i) => i.id === id);
    setLine((l) => (it ? { ...l, itemId: it.id, description: it.name, unit: it.unit } : { ...l, itemId: "" }));
  };
  const selectedItem = items?.find((i) => i.id === line.itemId);
  const estimate = selectedItem ? selectedItem.lastPurchasePrice * Number(line.quantity || 0) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Number(line.quantity) <= 0) return setError("Quantity must be at least 1");
    const pr = await run(() => api.post<PurchaseRequest>("/purchase-requests", {
      ...f,
      requestedBy: user.name,
      budgetAmount: f.budgetAmount ? Number(f.budgetAmount) : null,
      lines: [{ ...line, itemId: line.itemId || null, quantity: Number(line.quantity) }],
    }));
    if (pr) router.push(`/procurement/${pr.id}`);
  };

  return (
    <>
      <PageHeader title="New purchase request"
        subtitle={reorder
          ? `Reorder alert: ${reorder.item.name} is at ${reorder.item.onHand} ${reorder.item.unit} (reorder level ${reorder.item.reorderLevel}).`
          : "Step 1: describe what you need. Next you'll choose vendors and send the RFQ."}
        back={{ href: "/procurement", label: "Purchase requests" }} />
      <form onSubmit={submit} className="space-y-6">
        <ErrorBox message={error} onClose={() => setError(null)} />
        <Card title="Request">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Title *" className="sm:col-span-2">
              <input className="input" required placeholder="e.g. Sports shoes for athletics team" value={f.title} onChange={(e) => set("title", e.target.value)} />
            </Field>
            <Field label="Category *">
              <select className="input" value={f.categoryId} onChange={(e) => { set("categoryId", e.target.value); pickItem(""); }}>
                {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Department *"><input className="input" required placeholder="e.g. Physical Education" value={f.department} onChange={(e) => set("department", e.target.value)} /></Field>
            <Field label="Needed by *"><input className="input" type="date" required value={f.dueDate} min={inDays(1)} onChange={(e) => set("dueDate", e.target.value)} /></Field>
            <Field label="Deliver to"><input className="input" placeholder="e.g. Sports room" value={f.deliveryLocation} onChange={(e) => set("deliveryLocation", e.target.value)} /></Field>
            <Field label="Budget head"><input className="input" placeholder="e.g. Sports & PE" value={f.budgetHead} onChange={(e) => set("budgetHead", e.target.value)} /></Field>
            <Field label="Budget (₹)" hint="Quotes above this escalate to the higher official">
              <input className="input" type="number" min={0} value={f.budgetAmount} onChange={(e) => set("budgetAmount", e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card title="Item & specifications">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="From item master" className="lg:col-span-2">
              <select className="input" value={line.itemId} onChange={(e) => pickItem(e.target.value)}>
                <option value="">— Custom item —</option>
                {items?.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>)}
              </select>
            </Field>
            <Field label="Quantity *"><input className="input" type="number" min={1} required value={line.quantity} onChange={(e) => setLine({ ...line, quantity: e.target.value })} /></Field>
            <Field label="Unit"><input className="input" value={line.unit} onChange={(e) => setLine({ ...line, unit: e.target.value })} /></Field>
            <Field label="Description *" className="sm:col-span-2">
              <input className="input" required value={line.description} onChange={(e) => setLine({ ...line, description: e.target.value })} />
            </Field>
            <Field label="Specs (sizes, colour, brand…)" className="sm:col-span-2">
              <input className="input" placeholder="e.g. Size 5 x4, 6 x6, 7 x5…" value={line.specs} onChange={(e) => setLine({ ...line, specs: e.target.value })} />
            </Field>
          </div>
          {estimate !== null && (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Estimate from last purchase price ({money(selectedItem!.lastPurchasePrice)}/{selectedItem!.unit}): <b>{money(estimate)}</b> before tax
            </p>
          )}
        </Card>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => router.back()}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create & select vendors →"}</button>
        </div>
      </form>
    </>
  );
}
