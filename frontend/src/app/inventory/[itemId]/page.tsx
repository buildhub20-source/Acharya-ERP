"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AdjustDialog, IssueDialog } from "@/components/inventory/StockActions";
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { date, dateTime, label, money } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import type { Item, ItemDetail, Supplier } from "@/lib/types";

export default function StockItemPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const { data: d, error, reload } = useApi<ItemDetail>(`/stock/${itemId}`);
  const { data: suppliers } = useApi<Supplier[]>(`/items/${itemId}/suppliers`);
  const [issuing, setIssuing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [settings, setSettings] = useState<{ reorderLevel: string; reorderQuantity: string; location: string } | null>(null);
  const act = useAction();

  if (error) return <ErrorBox message={error} />;
  if (!d) return <Loading />;
  const i = d.item;
  const onOrder = d.openOrders.reduce((s, o) => s + o.pendingQuantity, 0);

  const saveSettings = async () => {
    if (!settings) return;
    const res = await act.run(() => api.put<Item>(`/stock/${i.id}/settings`, {
      reorderLevel: Number(settings.reorderLevel), reorderQuantity: Number(settings.reorderQuantity), location: settings.location,
    }));
    if (res) { setSettings(null); reload(); }
  };

  return (
    <>
      <PageHeader back={{ href: "/inventory", label: "Stock" }}
        title={<span className="flex flex-wrap items-center gap-3">{i.name} <StatusBadge status={i.stockStatus} /></span>}
        subtitle={<>{i.sku} · {d.categoryName} · {i.location ?? "No location set"}</>}
        actions={<>
          <button className="btn-secondary" onClick={() => setSettings({ reorderLevel: String(i.reorderLevel), reorderQuantity: String(i.reorderQuantity), location: i.location ?? "" })}>Stock settings</button>
          <button className="btn-secondary" onClick={() => setAdjusting(true)}>Adjust</button>
          <button className="btn-primary" disabled={i.onHand === 0} onClick={() => setIssuing(true)}>Issue to department</button>
        </>} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="On hand" value={`${i.onHand} ${i.unit}`} tone={i.stockStatus === "OK" ? "slate" : i.stockStatus === "LOW" ? "amber" : "rose"} />
        <Stat label="Reorder level" value={i.reorderLevel || "—"} hint={i.reorderQuantity ? `Reorder qty ${i.reorderQuantity}` : undefined} />
        <Stat label="On order" value={onOrder} tone="indigo" hint={`${d.openOrders.length} open PO(s)`} />
        <Stat label="Issued (30 days)" value={d.issuedLast30Days} />
        <Stat label="Stock value" value={money(i.stockValue, true)} tone="emerald" hint={`Avg ${money(i.avgUnitCost)} / ${i.unit}`} />
      </div>

      {d.openRequestId && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 border-poster/40 bg-poster/10 p-4 text-sm text-poster">
          <span>A purchase request for this item is already in progress.</span>
          <Link href={`/procurement/${d.openRequestId}`} className="btn-secondary">Open {d.openRequestNumber}</Link>
        </div>
      )}
      {i.stockStatus !== "OK" && onOrder === 0 && i.reorderLevel > 0 && !d.openRequestId && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 border-warn/30 bg-warn/10 p-4 text-sm text-warn">
          <span>Stock is at or below the reorder level and nothing is on order.</span>
          <Link href={`/procurement/new?itemId=${i.id}&qty=${i.reorderQuantity || i.reorderLevel * 2}`} className="btn-primary">Raise purchase request</Link>
        </div>
      )}

      {d.openOrders.length > 0 && (
        <Card title="Open purchase orders" className="mb-6" bodyClass="p-0">
          <ul className="divide-y divide-rule">
            {d.openOrders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <span><b className="font-medium">{o.number}</b> · {o.vendorName} · {o.pendingQuantity} of {o.orderedQuantity} pending · due {date(o.expectedDelivery)}
                  {o.overdue && <span className="ml-2 text-danger">overdue</span>}</span>
                <Link href={`/inventory/receipts/new?po=${o.id}`} className="btn-secondary px-2.5 py-1 text-xs">Receive</Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Suppliers" className="mb-6" bodyClass="p-0"
        actions={<span className="text-xs text-ink-mute">From vendor catalogues</span>}>
        {!suppliers?.length ? <Empty>No vendor lists this item yet. Map it on a vendor&apos;s Catalogue tab.</Empty> : (
          <ul className="divide-y divide-rule">
            {suppliers.map((s, idx) => (
              <li key={s.vendorId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <span>
                  <Link href={`/vendors/${s.vendorId}`} className="font-medium text-ink hover:text-poster">{s.vendorName}</Link>
                  {idx === 0 && s.status === "ACTIVE" && <span className="ml-2"><Badge tone="green">Best price</Badge></span>}
                  <span className="ml-2 text-xs text-ink-mute">score {s.score.toFixed(0)}{s.minOrderQuantity ? ` · MOQ ${s.minOrderQuantity}` : ""}{s.leadTimeDays != null ? ` · ${s.leadTimeDays}d` : ""}</span>
                </span>
                <span className="flex items-center gap-2"><span className="tabular-nums">{money(s.typicalPrice)}</span>{s.status !== "ACTIVE" && <StatusBadge status={s.status} />}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Stock ledger" bodyClass="p-0">
        {d.movements.length === 0 ? <Empty>No movements yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-raised">
                <tr><th className="th">When</th><th className="th">Type</th><th className="th">Reference</th><th className="th">Details</th>
                  <th className="th text-right">In / out</th><th className="th text-right">Balance</th><th className="th text-right">Cost</th></tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {d.movements.map((m) => (
                  <tr key={m.id}>
                    <td className="td whitespace-nowrap text-xs text-ink-mute">{dateTime(m.at)}</td>
                    <td className="td"><StatusBadge status={m.type} /></td>
                    <td className="td text-xs">
                      {m.type === "RECEIPT" && m.referenceId ? <Link className="text-poster hover:underline" href={`/inventory/receipts/${m.referenceId}`}>{m.reference}</Link> : m.reference}
                    </td>
                    <td className="td text-xs text-ink-soft">
                      {m.department && <div className="font-medium text-ink-soft">{m.department}{m.issuedTo ? ` · ${m.issuedTo}` : ""}</div>}
                      {m.reason}
                      <div className="text-ink-mute">{m.by}</div>
                    </td>
                    <td className={`td text-right font-semibold tabular-nums ${m.quantity > 0 ? "text-ok" : "text-danger"}`}>{m.quantity > 0 ? "+" : ""}{m.quantity}</td>
                    <td className="td text-right tabular-nums">{m.balanceAfter}</td>
                    <td className="td text-right tabular-nums text-xs">{money(m.unitCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {issuing && <IssueDialog item={i} onClose={() => setIssuing(false)} onDone={() => { setIssuing(false); reload(); }} />}
      {adjusting && <AdjustDialog item={i} onClose={() => setAdjusting(false)} onDone={() => { setAdjusting(false); reload(); }} />}
      <Modal open={!!settings} title="Stock settings" onClose={() => setSettings(null)}
        footer={<><button className="btn-secondary" onClick={() => setSettings(null)}>Cancel</button><button className="btn-primary" disabled={act.busy} onClick={saveSettings}>Save</button></>}>
        <ErrorBox message={act.error} onClose={() => act.setError(null)} />
        {settings && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Reorder level" hint="Alert when on hand + on order falls to this"><input className="input" type="number" min={0} value={settings.reorderLevel} onChange={(e) => setSettings({ ...settings, reorderLevel: e.target.value })} /></Field>
            <Field label="Reorder quantity" hint="Pre-filled on the purchase request"><input className="input" type="number" min={0} value={settings.reorderQuantity} onChange={(e) => setSettings({ ...settings, reorderQuantity: e.target.value })} /></Field>
            <Field label="Store location" className="sm:col-span-2"><input className="input" value={settings.location} onChange={(e) => setSettings({ ...settings, location: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
      <p className="mt-4 text-xs text-ink-mute">Last purchase price {money(i.lastPurchasePrice)} · {label(i.stockStatus)}</p>
    </>
  );
}
