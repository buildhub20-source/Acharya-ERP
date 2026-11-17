"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, ErrorBox, Field } from "@/components/ui";
import { useUser } from "@/components/UserContext";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import type { Category, Channel, ContactPerson, Vendor, VendorType } from "@/lib/types";

const blankContact = (): ContactPerson => ({
  name: "", role: "", phone: "", whatsapp: "", email: "", preferredChannel: "WHATSAPP", phoneVerified: false, emailVerified: false,
});

export default function VendorForm({ vendor }: { vendor?: Vendor }) {
  const router = useRouter();
  const { user } = useUser();
  const { data: categories } = useApi<Category[]>("/categories");
  const { busy, error, setError, run } = useAction();
  const editing = !!vendor;
  const identityLocked = editing && (vendor.status === "ACTIVE" || vendor.status === "SUSPENDED");

  const [mode, setMode] = useState<"invite" | "full">("full");
  const [f, setF] = useState({
    legalName: vendor?.legalName ?? "",
    tradeName: vendor?.tradeName ?? "",
    type: (vendor?.type ?? "DISTRIBUTOR") as VendorType,
    yearEstablished: vendor?.yearEstablished?.toString() ?? "",
    gstin: vendor?.gstin ?? "",
    pan: vendor?.pan ?? "",
    msmeNumber: vendor?.msmeNumber ?? "",
    registeredAddress: vendor?.registeredAddress ?? "",
    city: vendor?.city ?? "",
    pincode: vendor?.pincode ?? "",
    paymentTerms: vendor?.paymentTerms ?? "NET_30",
    leadTimeDays: vendor?.leadTimeDays?.toString() ?? "",
    minOrderValue: vendor?.minOrderValue?.toString() ?? "",
    portalEnabled: vendor?.portalEnabled ?? true,
  });
  const [cats, setCats] = useState<string[]>(vendor?.categoryIds ?? []);
  const [contacts, setContacts] = useState<ContactPerson[]>(vendor?.contacts.length ? vendor.contacts : [blankContact()]);
  const [bank, setBank] = useState({ accountName: vendor?.bank?.accountName ?? "", accountNumber: "", ifsc: vendor?.bank?.ifsc ?? "", bankName: vendor?.bank?.bankName ?? "" });

  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const setContact = (i: number, k: keyof ContactPerson, v: string | boolean) =>
    setContacts((cs) => cs.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const invite = !editing && mode === "invite";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cats.length === 0) return setError("Pick at least one category");
    const num = (s: string) => (s.trim() === "" ? null : Number(s));
    const payload = {
      ...f,
      gstin: f.gstin.trim().toUpperCase(),
      pan: f.pan.trim().toUpperCase(),
      yearEstablished: num(f.yearEstablished),
      leadTimeDays: num(f.leadTimeDays),
      minOrderValue: num(f.minOrderValue),
      categoryIds: cats,
      contacts: contacts.map((c) => ({ ...c, whatsapp: c.whatsapp || c.phone })),
      bank: bank.accountNumber ? { ...bank, ifsc: bank.ifsc.toUpperCase() } : null,
      inviteOnly: invite,
      actor: user.name,
    };
    const saved = await run(() =>
      editing ? api.put<Vendor>(`/vendors/${vendor.id}`, payload) : api.post<Vendor>("/vendors", payload),
    );
    if (saved) router.push(`/vendors/${saved.id}`);
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <ErrorBox message={error} onClose={() => setError(null)} />

      {!editing && (
        <div className="flex gap-2 rounded-lg bg-raised-2 p-1 text-sm sm:w-fit">
          {(["full", "invite"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`rounded-md px-4 py-1.5 ${mode === m ? "bg-panel font-medium shadow-sm" : "text-ink-soft"}`}>
              {m === "full" ? "Register with full details" : "Quick invite (vendor completes on portal)"}
            </button>
          ))}
        </div>
      )}

      <Card title="Business details">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Legal name *" hint={identityLocked ? "Locked for approved vendors — raise re-verification" : undefined}>
            <input className="input" required value={f.legalName} disabled={identityLocked} onChange={(e) => set("legalName", e.target.value)} />
          </Field>
          <Field label="Trade name"><input className="input" value={f.tradeName} onChange={(e) => set("tradeName", e.target.value)} /></Field>
          <Field label="Type">
            <select className="input" value={f.type} onChange={(e) => set("type", e.target.value)}>
              {["MANUFACTURER", "DISTRIBUTOR", "RETAILER", "SERVICE"].map((t) => <option key={t} value={t}>{t[0] + t.slice(1).toLowerCase()}</option>)}
            </select>
          </Field>
          {!invite && (
            <>
              <Field label="GSTIN" hint="15 characters, e.g. 33AABCS1234F1Z5">
                <input className="input uppercase" maxLength={15} value={f.gstin} disabled={identityLocked} onChange={(e) => set("gstin", e.target.value)} />
              </Field>
              <Field label="PAN"><input className="input uppercase" maxLength={10} value={f.pan} disabled={identityLocked} onChange={(e) => set("pan", e.target.value)} /></Field>
              <Field label="MSME / Udyam no."><input className="input" value={f.msmeNumber} onChange={(e) => set("msmeNumber", e.target.value)} /></Field>
              <Field label="Address" className="sm:col-span-2"><input className="input" value={f.registeredAddress} onChange={(e) => set("registeredAddress", e.target.value)} /></Field>
              <Field label="Year established"><input className="input" type="number" value={f.yearEstablished} onChange={(e) => set("yearEstablished", e.target.value)} /></Field>
            </>
          )}
          <Field label="City"><input className="input" value={f.city} onChange={(e) => set("city", e.target.value)} /></Field>
          {!invite && <Field label="Pincode"><input className="input" maxLength={6} value={f.pincode} onChange={(e) => set("pincode", e.target.value)} /></Field>}
        </div>
      </Card>

      <Card title="Categories supplied *">
        <div className="flex flex-wrap gap-2">
          {categories?.map((c) => {
            const on = cats.includes(c.id);
            return (
              <button key={c.id} type="button" title={c.description}
                onClick={() => setCats((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-poster bg-poster/10 text-poster" : "border-rule-strong text-ink-soft hover:bg-raised"}`}>
                {on ? "✓ " : ""}{c.name}
              </button>
            );
          })}
        </div>
      </Card>

      <Card title="Contacts & channels *" actions={
        <button type="button" className="btn-ghost text-xs" onClick={() => setContacts((c) => [...c, blankContact()])}>+ Add contact</button>
      }>
        <div className="space-y-5">
          {contacts.map((c, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <Field label="Name *" className="lg:col-span-2"><input className="input" required value={c.name} onChange={(e) => setContact(i, "name", e.target.value)} /></Field>
              <Field label="Role"><input className="input" value={c.role} onChange={(e) => setContact(i, "role", e.target.value)} /></Field>
              <Field label="Phone *"><input className="input" required value={c.phone} onChange={(e) => setContact(i, "phone", e.target.value)} /></Field>
              <Field label="Email"><input className="input" type="email" value={c.email} onChange={(e) => setContact(i, "email", e.target.value)} /></Field>
              <Field label="Preferred channel">
                <select className="input" value={c.preferredChannel} onChange={(e) => setContact(i, "preferredChannel", e.target.value as Channel)}>
                  {["WHATSAPP", "EMAIL", "SMS", "PORTAL"].map((ch) => <option key={ch} value={ch}>{ch[0] + ch.slice(1).toLowerCase()}</option>)}
                </select>
              </Field>
              <div className="flex flex-wrap items-center gap-4 text-xs text-ink-soft lg:col-span-6">
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={c.phoneVerified} onChange={(e) => setContact(i, "phoneVerified", e.target.checked)} /> Phone OTP verified</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={c.emailVerified} onChange={(e) => setContact(i, "emailVerified", e.target.checked)} /> Email verified</label>
                {contacts.length > 1 && (
                  <button type="button" className="text-danger hover:underline" onClick={() => setContacts((cs) => cs.filter((_, j) => j !== i))}>Remove</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {!invite && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Bank details">
            {editing && vendor.bank && (
              <p className="mb-3 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
                Current account {vendor.bank.maskedAccountNumber}. Entering a new account on an approved vendor needs approver
                sign-off, and payments are held until then.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Account name"><input className="input" value={bank.accountName} onChange={(e) => setBank({ ...bank, accountName: e.target.value })} /></Field>
              <Field label={editing ? "New account number" : "Account number"}><input className="input" value={bank.accountNumber} onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })} /></Field>
              <Field label="IFSC"><input className="input uppercase" maxLength={11} value={bank.ifsc} onChange={(e) => setBank({ ...bank, ifsc: e.target.value })} /></Field>
              <Field label="Bank"><input className="input" value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} /></Field>
            </div>
          </Card>
          <Card title="Commercial terms">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Payment terms">
                <select className="input" value={f.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)}>
                  <option value="ADVANCE">Advance</option><option value="NET_15">Net 15 days</option><option value="NET_30">Net 30 days</option>
                </select>
              </Field>
              <Field label="Lead time (days)"><input className="input" type="number" value={f.leadTimeDays} onChange={(e) => set("leadTimeDays", e.target.value)} /></Field>
              <Field label="Minimum order value (₹)"><input className="input" type="number" value={f.minOrderValue} onChange={(e) => set("minOrderValue", e.target.value)} /></Field>
              <label className="flex items-center gap-2 pt-6 text-sm text-ink-soft">
                <input type="checkbox" checked={f.portalEnabled} onChange={(e) => set("portalEnabled", e.target.checked)} /> Vendor portal access
              </label>
            </div>
          </Card>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={() => router.back()}>Cancel</button>
        <button className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : editing ? "Save changes" : invite ? "Send portal invite" : "Submit for verification"}
        </button>
      </div>
    </form>
  );
}
