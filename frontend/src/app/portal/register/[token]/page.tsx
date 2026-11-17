"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { GradusMark } from "@/components/Brand";
import { Badge, Card, ErrorBox, Field, Loading, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { date, label } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import type { Category, Channel, ContactPerson, OnboardingView, OtpSent, Vendor, VendorType } from "@/lib/types";

const STEPS = ["Business", "Contacts", "Bank & terms", "Documents", "Review"] as const;
type Step = (typeof STEPS)[number];
const DOC_TYPES = [
  { type: "GST_CERT", label: "GST certificate", required: true },
  { type: "PAN", label: "PAN card", required: true },
  { type: "CANCELLED_CHEQUE", label: "Cancelled cheque", required: false },
  { type: "TRADE_LICENCE", label: "Trade licence", required: false, expires: true },
  { type: "MSME", label: "MSME / Udyam certificate", required: false },
  { type: "FSSAI", label: "FSSAI licence (food suppliers)", required: false, expires: true },
];

/** Vendor onboarding wizard, opened from the personal link in the invite. */
export default function OnboardingPage() {
  const { token } = useParams<{ token: string }>();
  const { data, error, setData } = useApi<OnboardingView>(`/portal/onboarding/${token}`);

  if (error) {
    return (
      <Shell>
        <Card><p className="text-sm text-ink-soft">This onboarding link is invalid or has expired. Ask the school&apos;s procurement team to resend it, or <Link className="text-poster hover:underline" href="/portal/register">register again</Link>.</p></Card>
      </Shell>
    );
  }
  if (!data) return <Shell><Loading /></Shell>;
  return <Shell vendor={data.vendor}><Wizard key={data.vendor.id} token={token} view={data} onView={setData} /></Shell>;
}

function Shell({ children, vendor }: { children: React.ReactNode; vendor?: Vendor }) {
  return (
    <div className="min-h-screen bg-wall">
      <header className="border-b border-rule bg-panel">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <GradusMark size={32} />
            <div>
              <div className="text-sm font-semibold text-ink">Supplier registration · Greenfield Public School</div>
              {vendor && <div className="text-xs text-ink-mute">{vendor.displayName} · {vendor.code}</div>}
            </div>
          </div>
          {vendor && <StatusBadge status={vendor.status} />}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

function toForm(v: Vendor) {
  return {
    legalName: v.legalName ?? "", tradeName: v.tradeName ?? "", type: v.type as VendorType, yearEstablished: v.yearEstablished?.toString() ?? "",
    gstin: v.gstin ?? "", pan: v.pan ?? "", msmeNumber: v.msmeNumber ?? "", registeredAddress: v.registeredAddress ?? "",
    city: v.city ?? "", pincode: v.pincode ?? "", paymentTerms: v.paymentTerms ?? "NET_30",
    leadTimeDays: v.leadTimeDays?.toString() ?? "", minOrderValue: v.minOrderValue?.toString() ?? "",
  };
}

function Wizard({ token, view, onView }: { token: string; view: OnboardingView; onView: (v: OnboardingView) => void }) {
  const v = view.vendor;
  const { data: categories } = useApi<Category[]>("/portal/categories");
  const act = useAction();
  const [step, setStep] = useState<Step>("Business");
  const [f, setF] = useState(() => toForm(v));
  const [cats, setCats] = useState<string[]>(v.categoryIds);
  const [contacts, setContacts] = useState<ContactPerson[]>(v.contacts);
  const [bank, setBank] = useState({ accountName: v.bank?.accountName ?? "", accountNumber: "", ifsc: v.bank?.ifsc ?? "", bankName: v.bank?.bankName ?? "" });
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [otp, setOtp] = useState<{ index: number; channel: "PHONE" | "EMAIL"; sent: OtpSent; code: string } | null>(null);
  const [doc, setDoc] = useState<{ type: string; number: string; expiryDate: string; fileName: string } | null>(null);
  const [declared, setDeclared] = useState(false);

  const set = (k: keyof typeof f, val: string) => { setF((p) => ({ ...p, [k]: val })); setDirty(true); };
  const setContact = (i: number, k: keyof ContactPerson, val: string) => {
    setContacts((cs) => cs.map((c, j) => (j === i ? { ...c, [k]: val } : c)));
    setDirty(true);
  };

  if (!view.editable) {
    return (
      <Card>
        {v.status === "PENDING_VERIFICATION" ? (
          <div className="space-y-2 text-sm text-ink-soft">
            <h2 className="font-display text-2xl text-ink">Thank you, submitted</h2>
            <p>Your profile was submitted on {date(v.submittedAt)} and is with the school&apos;s procurement team for verification. You&apos;ll get a message once it is approved, or if anything needs correcting.</p>
          </div>
        ) : v.status === "ACTIVE" ? (
          <div className="space-y-3 text-sm text-ink-soft">
            <h2 className="font-display text-2xl text-ink">You&apos;re an approved supplier</h2>
            <p>Your registration is complete. RFQs, purchase orders and documents are in the vendor portal.</p>
            <Link href={`/portal/${v.id}`} className="btn-primary">Open vendor portal</Link>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">This registration is {label(v.status)} and can no longer be edited here.</p>
        )}
      </Card>
    );
  }

  const payload = () => ({
    ...f,
    gstin: f.gstin.trim().toUpperCase(), pan: f.pan.trim().toUpperCase(),
    yearEstablished: f.yearEstablished ? Number(f.yearEstablished) : null,
    leadTimeDays: f.leadTimeDays ? Number(f.leadTimeDays) : null,
    minOrderValue: f.minOrderValue ? Number(f.minOrderValue) : null,
    categoryIds: cats, contacts,
    bank: bank.accountNumber ? { ...bank, ifsc: bank.ifsc.toUpperCase() } : null,
    portalEnabled: true, inviteOnly: false,
  });

  /** Saves the draft; returns the fresh view so callers can chain. */
  const save = async () => {
    const res = await act.run(() => api.put<OnboardingView>(`/portal/onboarding/${token}`, payload()));
    if (res) {
      onView(res);
      setContacts(res.vendor.contacts);
      setBank((b) => ({ ...b, accountNumber: "" }));
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    return res;
  };
  const next = async () => {
    if (dirty && !(await save())) return;
    setStep(STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(step) + 1)]);
  };

  const sendOtp = async (index: number, channel: "PHONE" | "EMAIL") => {
    if (dirty && !(await save())) return;
    const sent = await act.run(() => api.post<OtpSent>(`/portal/onboarding/${token}/otp`, { contactIndex: index, channel }));
    if (sent) setOtp({ index, channel, sent, code: "" });
  };
  const verifyOtp = async () => {
    if (!otp) return;
    const res = await act.run(() => api.post<OnboardingView>(`/portal/onboarding/${token}/otp/verify`, { contactIndex: otp.index, channel: otp.channel, code: otp.code }));
    if (res) { onView(res); setContacts(res.vendor.contacts); setOtp(null); }
  };
  const uploadDoc = async () => {
    if (!doc) return;
    const res = await act.run(() => api.post<OnboardingView>(`/portal/onboarding/${token}/documents`, {
      type: doc.type, number: doc.number || null, expiryDate: doc.expiryDate || null, fileName: doc.fileName || null,
    }));
    if (res) { onView(res); setDoc(null); }
  };
  const removeDoc = async (id: string) => {
    const res = await act.run(() => api.del<OnboardingView>(`/portal/onboarding/${token}/documents/${id}`));
    if (res) onView(res);
  };
  const submit = async () => {
    if (dirty && !(await save())) return;
    const res = await act.run(() => api.post<OnboardingView>(`/portal/onboarding/${token}/submit`));
    if (res) onView(res);
  };

  const done = (s: Step) => {
    const m = view.missing;
    if (s === "Business") return !m.some((x) => ["Legal name", "GSTIN", "PAN", "Full address", "At least one category"].includes(x));
    if (s === "Contacts") return !m.some((x) => x.startsWith("Verify") || x === "A contact person");
    if (s === "Bank & terms") return !m.includes("Bank details");
    if (s === "Documents") return !m.includes("GST certificate") && !m.includes("PAN card");
    return view.canSubmit;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <aside className="space-y-4">
        {v.status === "SENT_BACK" && v.statusReason && (
          <div className="rounded-md border border-warn/30 bg-warn/10 p-3 text-xs text-warn"><b>The school asked for changes:</b> {v.statusReason}</div>
        )}
        <ol className="card divide-y divide-rule">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button onClick={() => setStep(s)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm ${step === s ? "bg-poster/10 font-semibold text-poster" : "text-ink-soft hover:bg-raised"}`}>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${done(s) ? "bg-ok text-wall" : "bg-raised-2 text-ink-mute ring-1 ring-rule"}`}>
                  {done(s) ? "✓" : i + 1}
                </span>
                {s}
              </button>
            </li>
          ))}
        </ol>
        <p className="text-xs text-ink-mute">Your progress is saved as you go. You can close this page and come back with the same link.</p>
      </aside>

      <section className="min-w-0 space-y-4">
        <ErrorBox message={act.error} onClose={() => act.setError(null)} />

        {step === "Business" && (
          <Card title="Business details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Legal name (as on GST certificate) *" className="sm:col-span-2"><input className="input" value={f.legalName} onChange={(e) => set("legalName", e.target.value)} /></Field>
              <Field label="Trade name"><input className="input" value={f.tradeName} onChange={(e) => set("tradeName", e.target.value)} /></Field>
              <Field label="Business type">
                <select className="input" value={f.type} onChange={(e) => set("type", e.target.value)}>
                  {["MANUFACTURER", "DISTRIBUTOR", "RETAILER", "SERVICE"].map((t) => <option key={t} value={t}>{t[0] + t.slice(1).toLowerCase()}</option>)}
                </select>
              </Field>
              <Field label="GSTIN *" hint="15 characters, e.g. 33AABCS1234F1Z5"><input className="input uppercase" maxLength={15} value={f.gstin} onChange={(e) => set("gstin", e.target.value)} /></Field>
              <Field label="PAN *"><input className="input uppercase" maxLength={10} value={f.pan} onChange={(e) => set("pan", e.target.value)} /></Field>
              <Field label="MSME / Udyam no."><input className="input" value={f.msmeNumber} onChange={(e) => set("msmeNumber", e.target.value)} /></Field>
              <Field label="Year established"><input className="input" type="number" value={f.yearEstablished} onChange={(e) => set("yearEstablished", e.target.value)} /></Field>
              <Field label="Registered address *" className="sm:col-span-2"><input className="input" value={f.registeredAddress} onChange={(e) => set("registeredAddress", e.target.value)} /></Field>
              <Field label="City *"><input className="input" value={f.city} onChange={(e) => set("city", e.target.value)} /></Field>
              <Field label="Pincode *"><input className="input" maxLength={6} inputMode="numeric" value={f.pincode} onChange={(e) => set("pincode", e.target.value)} /></Field>
            </div>
            <div className="mt-5">
              <span className="field-label">Categories you supply *</span>
              <div className="flex flex-wrap gap-2">
                {categories?.map((c) => {
                  const on = cats.includes(c.id);
                  return (
                    <button key={c.id} type="button" onClick={() => { setCats((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id])); setDirty(true); }}
                      className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-poster bg-poster/10 text-poster" : "border-rule-strong text-ink-soft hover:bg-raised"}`}>
                      {on ? "✓ " : ""}{c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>
        )}

        {step === "Contacts" && (
          <Card title="Contacts & verification" actions={
            <button className="btn-ghost text-xs" onClick={() => { setContacts((c) => [...c, { name: "", role: "", phone: "", whatsapp: "", email: "", preferredChannel: "WHATSAPP", phoneVerified: false, emailVerified: false }]); setDirty(true); }}>+ Add contact</button>
          }>
            <p className="mb-4 text-sm text-ink-soft">Verify at least one phone number or email with a one-time code. RFQs and purchase orders are sent to these contacts.</p>
            <div className="space-y-5">
              {contacts.map((c, i) => (
                <div key={i} className="rounded-md border border-rule p-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Name *"><input className="input" value={c.name} onChange={(e) => setContact(i, "name", e.target.value)} /></Field>
                    <Field label="Role"><input className="input" value={c.role ?? ""} onChange={(e) => setContact(i, "role", e.target.value)} /></Field>
                    <Field label="Mobile *"><input className="input" value={c.phone ?? ""} onChange={(e) => setContact(i, "phone", e.target.value)} /></Field>
                    <Field label="Email"><input className="input" type="email" value={c.email ?? ""} onChange={(e) => setContact(i, "email", e.target.value)} /></Field>
                    <Field label="Preferred channel">
                      <select className="input" value={c.preferredChannel} onChange={(e) => setContact(i, "preferredChannel", e.target.value as Channel)}>
                        {["WHATSAPP", "EMAIL", "SMS", "PORTAL"].map((ch) => <option key={ch} value={ch}>{ch[0] + ch.slice(1).toLowerCase()}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                    <Verify label="Mobile" verified={c.phoneVerified} disabled={!c.phone || act.busy} onSend={() => sendOtp(i, "PHONE")} />
                    <Verify label="Email" verified={c.emailVerified} disabled={!c.email || act.busy} onSend={() => sendOtp(i, "EMAIL")} />
                    {contacts.length > 1 && <button className="ml-auto text-xs text-danger hover:underline" onClick={() => { setContacts((cs) => cs.filter((_, j) => j !== i)); setDirty(true); }}>Remove</button>}
                  </div>
                  {otp && otp.index === i && (
                    <div className="mt-3 flex flex-wrap items-end gap-3 rounded-md bg-raised p-3">
                      <Field label={`Code sent to ${otp.sent.sentTo}`}>
                        <input className="input w-36 font-mono tracking-[0.3em]" maxLength={6} inputMode="numeric" autoFocus value={otp.code}
                          onChange={(e) => setOtp({ ...otp, code: e.target.value.replace(/\D/g, "") })} />
                      </Field>
                      <button className="btn-primary" disabled={otp.code.length !== 6 || act.busy} onClick={verifyOtp}>Verify</button>
                      <button className="btn-ghost text-xs" disabled={act.busy} onClick={() => sendOtp(i, otp.channel)}>Resend</button>
                      {otp.sent.devCode && <span className="text-xs text-ink-mute">Demo mode, your code is <b className="font-mono text-poster">{otp.sent.devCode}</b></span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {step === "Bank & terms" && (
          <Card title="Bank details & commercial terms">
            {v.bank && <p className="mb-4 text-sm text-ink-soft">Saved account: <span className="font-mono">{v.bank.maskedAccountNumber}</span> ({v.bank.bankName}). Enter a number below only to replace it.</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Account holder name *"><input className="input" value={bank.accountName} onChange={(e) => { setBank({ ...bank, accountName: e.target.value }); setDirty(true); }} /></Field>
              <Field label={v.bank ? "New account number" : "Account number *"}><input className="input" inputMode="numeric" value={bank.accountNumber} onChange={(e) => { setBank({ ...bank, accountNumber: e.target.value }); setDirty(true); }} /></Field>
              <Field label="IFSC *"><input className="input uppercase" maxLength={11} value={bank.ifsc} onChange={(e) => { setBank({ ...bank, ifsc: e.target.value }); setDirty(true); }} /></Field>
              <Field label="Bank name"><input className="input" value={bank.bankName} onChange={(e) => { setBank({ ...bank, bankName: e.target.value }); setDirty(true); }} /></Field>
              <Field label="Payment terms you offer">
                <select className="input" value={f.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)}>
                  <option value="ADVANCE">Advance</option><option value="NET_15">Net 15 days</option><option value="NET_30">Net 30 days</option>
                </select>
              </Field>
              <Field label="Usual delivery time (days)"><input className="input" type="number" min={0} value={f.leadTimeDays} onChange={(e) => set("leadTimeDays", e.target.value)} /></Field>
              <Field label="Minimum order value (₹)"><input className="input" type="number" min={0} value={f.minOrderValue} onChange={(e) => set("minOrderValue", e.target.value)} /></Field>
            </div>
            <p className="mt-4 text-xs text-ink-mute">Bank details are stored encrypted and only the last 4 digits are ever shown. The school verifies them before the first payment.</p>
          </Card>
        )}

        {step === "Documents" && (
          <Card title="Documents">
            <ul className="divide-y divide-rule">
              {DOC_TYPES.map((t) => {
                const d = v.documents.find((x) => x.type === t.type);
                return (
                  <li key={t.type} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <span className="font-medium text-ink">{t.label}</span> {t.required ? <Badge tone="amber">Required</Badge> : <span className="text-xs text-ink-mute">Optional</span>}
                      {d && <div className="text-xs text-ink-mute">{d.fileName}{d.number ? ` · ${d.number}` : ""}{d.expiryDate ? ` · valid till ${date(d.expiryDate)}` : ""}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      {d && <StatusBadge status={d.verification} />}
                      {d && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => removeDoc(d.id)}>Remove</button>}
                      <button className="btn-secondary px-2.5 py-1 text-xs" onClick={() => setDoc({ type: t.type, number: t.type === "GST_CERT" ? f.gstin : t.type === "PAN" ? f.pan : "", expiryDate: "", fileName: "" })}>
                        {d ? "Replace" : "Upload"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {doc && (
              <div className="mt-4 grid gap-3 rounded-md bg-raised p-4 sm:grid-cols-4">
                <Field label="File" className="sm:col-span-2">
                  <input className="input file:mr-3 file:rounded file:border-0 file:bg-raised-2 file:px-2 file:py-1 file:text-ink" type="file" accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setDoc({ ...doc, fileName: e.target.files?.[0]?.name ?? "" })} />
                </Field>
                <Field label="Number"><input className="input" value={doc.number} onChange={(e) => setDoc({ ...doc, number: e.target.value })} /></Field>
                {DOC_TYPES.find((t) => t.type === doc.type)?.expires
                  ? <Field label="Valid till"><input className="input" type="date" value={doc.expiryDate} onChange={(e) => setDoc({ ...doc, expiryDate: e.target.value })} /></Field>
                  : <div />}
                <div className="flex gap-2 sm:col-span-4">
                  <button className="btn-primary" disabled={act.busy} onClick={uploadDoc}>Save document</button>
                  <button className="btn-ghost" onClick={() => setDoc(null)}>Cancel</button>
                  <span className="self-center text-xs text-ink-mute">File storage moves to Supabase Storage; for now only the file name and details are kept.</span>
                </div>
              </div>
            )}
          </Card>
        )}

        {step === "Review" && (
          <Card title="Review & submit">
            {view.missing.length > 0 ? (
              <div className="rounded-md border border-warn/30 bg-warn/10 p-4 text-sm text-warn">
                <b>Still needed before you can submit:</b>
                <ul className="mt-2 list-disc pl-5">{view.missing.map((m) => <li key={m}>{m}</li>)}</ul>
              </div>
            ) : (
              <p className="rounded-md border border-ok/30 bg-ok/10 p-4 text-sm text-ok">Everything is in place. Submit to send your profile to the school for verification.</p>
            )}
            <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Row k="Legal name" v={v.legalName} /><Row k="GSTIN / PAN" v={`${v.gstin ?? "—"} / ${v.pan ?? "—"}`} />
              <Row k="Address" v={[v.registeredAddress, v.city, v.pincode].filter(Boolean).join(", ") || "—"} />
              <Row k="Categories" v={v.categoryIds.map((c) => categories?.find((x) => x.id === c)?.name ?? c).join(", ")} />
              <Row k="Contacts" v={v.contacts.map((c) => `${c.name}${c.phoneVerified || c.emailVerified ? " ✓" : ""}`).join(", ")} />
              <Row k="Bank" v={v.bank ? `${v.bank.maskedAccountNumber} · ${v.bank.ifsc}` : "—"} />
              <Row k="Documents" v={v.documents.map((d) => label(d.type)).join(", ") || "—"} />
            </dl>
            <label className="mt-5 flex items-start gap-2 text-xs text-ink-soft">
              <input type="checkbox" className="mt-0.5" checked={declared} onChange={(e) => setDeclared(e.target.checked)} /> I confirm these details are correct and belong to the business named above.
            </label>
            <button className="btn-primary mt-4" disabled={!view.canSubmit || !declared || act.busy} onClick={submit}>
              Submit for verification
            </button>
          </Card>
        )}

        {step !== "Review" && (
          <div className="flex items-center justify-end gap-3">
            {saved && <span className="text-xs text-ok">Saved</span>}
            <button className="btn-secondary" disabled={act.busy || !dirty} onClick={save}>Save draft</button>
            <button className="btn-primary" disabled={act.busy} onClick={next}>Save & continue →</button>
          </div>
        )}
      </section>
    </div>
  );
}

function Verify({ label: text, verified, disabled, onSend }: { label: string; verified: boolean; disabled: boolean; onSend: () => void }) {
  return verified
    ? <Badge tone="green">{text} verified</Badge>
    : <button className="btn-secondary px-2.5 py-1 text-xs" disabled={disabled} onClick={onSend}>Verify {text.toLowerCase()}</button>;
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div><dt className="text-xs text-ink-mute">{k}</dt><dd className="mt-0.5 text-ink-soft">{v}</dd></div>;
}
