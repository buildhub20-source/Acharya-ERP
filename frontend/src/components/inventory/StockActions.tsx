"use client";

import { useState } from "react";
import { ErrorBox, Field, Modal } from "@/components/ui";
import { useUser } from "@/components/UserContext";
import { api } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import type { Item, StockMovement } from "@/lib/types";

const DEPARTMENTS = [
  "Academics - Primary", "Academics - Middle School", "Academics - Senior School", "Science Department",
  "Physical Education", "Co-curricular", "Administration", "Admissions", "Housekeeping", "Transport",
];

/** Issue-to-department and stock-adjustment dialogs, shared by the stock list and item page. */
export function IssueDialog({ item, onClose, onDone }: { item: Item | null; onClose: () => void; onDone: (m: StockMovement) => void }) {
  const { user } = useUser();
  const { busy, error, setError, run } = useAction();
  const [f, setF] = useState({ quantity: "1", department: DEPARTMENTS[0], issuedTo: "", purpose: "" });
  if (!item) return null;
  const qty = Number(f.quantity || 0);
  const after = item.onHand - qty;

  const submit = async () => {
    const m = await run(() => api.post<StockMovement>("/stock/issues", { itemId: item.id, ...f, quantity: qty, by: user.name }));
    if (m) { onDone(m); setF({ quantity: "1", department: DEPARTMENTS[0], issuedTo: "", purpose: "" }); }
  };

  return (
    <Modal open title={`Issue ${item.name}`} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || qty <= 0 || qty > item.onHand} onClick={submit}>Issue {qty} {item.unit}</button></>}>
      <ErrorBox message={error} onClose={() => setError(null)} />
      <p className="mb-4 text-sm text-ink-soft">In stock: <b>{item.onHand} {item.unit}</b> · {item.location ?? "—"}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Quantity *"><input className="input" type="number" min={1} max={item.onHand} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field>
        <Field label="Department *">
          <select className="input" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}>
            {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Issued to" hint="Person, class or section"><input className="input" value={f.issuedTo} onChange={(e) => setF({ ...f, issuedTo: e.target.value })} /></Field>
        <Field label="Purpose"><input className="input" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} /></Field>
      </div>
      {qty > item.onHand && <p className="mt-3 text-sm text-danger">Only {item.onHand} available.</p>}
      {qty <= item.onHand && after <= item.reorderLevel && item.reorderLevel > 0 && (
        <p className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
          Stock will drop to {after}, at or below the reorder level ({item.reorderLevel}). It will show up in reorder alerts.
        </p>
      )}
    </Modal>
  );
}

export function AdjustDialog({ item, onClose, onDone }: { item: Item | null; onClose: () => void; onDone: (m: StockMovement) => void }) {
  const { user } = useUser();
  const { busy, error, setError, run } = useAction();
  const [direction, setDirection] = useState<"-" | "+">("-");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  if (!item) return null;
  const signed = (direction === "-" ? -1 : 1) * Number(qty || 0);

  const submit = async () => {
    const m = await run(() => api.post<StockMovement>("/stock/adjustments", { itemId: item.id, quantity: signed, reason, by: user.name }));
    if (m) { onDone(m); setQty("1"); setReason(""); }
  };

  return (
    <Modal open title={`Adjust stock · ${item.name}`} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !reason.trim() || signed === 0} onClick={submit}>Post adjustment</button></>}>
      <ErrorBox message={error} onClose={() => setError(null)} />
      <p className="mb-4 text-sm text-ink-soft">Use after a physical count, or for breakage, loss or items found. Every adjustment is logged in the ledger with a reason.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type">
          <select className="input" value={direction} onChange={(e) => setDirection(e.target.value as "-" | "+")}>
            <option value="-">Reduce (damaged / lost / count short)</option>
            <option value="+">Increase (found / count over)</option>
          </select>
        </Field>
        <Field label="Quantity"><input className="input" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Reason *" className="sm:col-span-2"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. 3 beakers broken during practical" /></Field>
      </div>
      <p className="mt-3 text-sm text-ink-soft">On hand: {item.onHand} → <b>{item.onHand + signed}</b> {item.unit}</p>
    </Modal>
  );
}
