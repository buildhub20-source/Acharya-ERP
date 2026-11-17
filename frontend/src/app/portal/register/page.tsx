"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GradusMark } from "@/components/Brand";
import { ErrorBox, Field } from "@/components/ui";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import type { Category, InviteLink, VendorType } from "@/lib/types";

/** Public "become a supplier" form. Creates a draft vendor and opens the onboarding wizard. */
export default function RegisterPage() {
  const router = useRouter();
  const { data: categories } = useApi<Category[]>("/portal/categories");
  const { busy, error, setError, run } = useAction();
  const [f, setF] = useState({ legalName: "", tradeName: "", type: "DISTRIBUTOR" as VendorType, city: "", contactName: "", phone: "", email: "" });
  const [cats, setCats] = useState<string[]>([]);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cats.length === 0) return setError("Pick at least one category you supply");
    const res = await run(() => api.post<InviteLink>("/portal/register", { ...f, email: f.email || null, categoryIds: cats }));
    if (res) router.push(new URL(res.link).pathname);
  };

  return (
    <div className="min-h-screen bg-wall bg-[radial-gradient(ellipse_at_top,rgb(246_210_0/0.08),transparent_60%)] px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <GradusMark size={40} />
          <div>
            <h1 className="font-display text-3xl leading-none text-ink">Become a supplier</h1>
            <p className="mt-1 text-sm text-ink-mute">Greenfield Public School · vendor registration</p>
          </div>
        </div>
        <form onSubmit={submit} className="card space-y-5 p-6">
          <ErrorBox message={error} onClose={() => setError(null)} />
          <p className="text-sm text-ink-soft">
            Tell us who you are. Next you&apos;ll complete your profile (GST, PAN, bank, documents) and verify your phone. The school
            reviews every new supplier before sending RFQs.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Legal business name *" className="sm:col-span-2"><input className="input" required value={f.legalName} onChange={(e) => set("legalName", e.target.value)} /></Field>
            <Field label="Trade name"><input className="input" value={f.tradeName} onChange={(e) => set("tradeName", e.target.value)} /></Field>
            <Field label="Business type">
              <select className="input" value={f.type} onChange={(e) => set("type", e.target.value)}>
                {["MANUFACTURER", "DISTRIBUTOR", "RETAILER", "SERVICE"].map((t) => <option key={t} value={t}>{t[0] + t.slice(1).toLowerCase()}</option>)}
              </select>
            </Field>
            <Field label="City *"><input className="input" required value={f.city} onChange={(e) => set("city", e.target.value)} /></Field>
            <Field label="Your name *"><input className="input" required value={f.contactName} onChange={(e) => set("contactName", e.target.value)} /></Field>
            <Field label="Mobile (WhatsApp) *" hint="We'll send a verification code here"><input className="input" required inputMode="tel" placeholder="+91 98765 43210" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
            <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          </div>
          <div>
            <span className="field-label">What do you supply? *</span>
            <div className="flex flex-wrap gap-2">
              {categories?.map((c) => {
                const on = cats.includes(c.id);
                return (
                  <button key={c.id} type="button" title={c.description} onClick={() => setCats((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-poster bg-poster/10 text-poster" : "border-rule-strong text-ink-soft hover:bg-raised"}`}>
                    {on ? "✓ " : ""}{c.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-5">
            <Link href="/portal" className="text-sm text-ink-mute hover:text-poster">Already registered? Sign in</Link>
            <button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Continue to profile →"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
