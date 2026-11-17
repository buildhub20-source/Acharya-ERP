"use client";

import Link from "next/link";
import { GradusMark } from "@/components/Brand";
import { ErrorBox, Loading } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import type { Vendor } from "@/lib/types";

/** Mock vendor login: pick a portal-enabled vendor. Replace with Supabase Auth (OTP). */
export default function PortalLogin() {
  const { data, error } = useApi<Vendor[]>("/vendors");
  const vendors = (data ?? []).filter((v) => v.portalEnabled);
  return (
    <div className="flex min-h-screen items-center justify-center bg-wall bg-[radial-gradient(ellipse_at_top,rgb(246_210_0/0.08),transparent_60%)] p-4">
      <div className="card w-full max-w-md p-6">
        <div className="mb-5 flex items-center gap-3">
          <GradusMark size={40} />
          <div>
            <h1 className="font-display text-2xl leading-none text-ink">Vendor Portal</h1>
            <p className="mt-1 text-xs text-ink-mute">Greenfield Public School · quotes, purchase orders and documents</p>
          </div>
        </div>
        <div className="mb-4 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
          Demo sign-in: choose a vendor. In production vendors sign in with a mobile OTP.
        </div>
        <ErrorBox message={error} />
        {!data ? <Loading /> : (
          <ul className="max-h-[50vh] divide-y divide-rule overflow-y-auto rounded-lg border border-rule">
            {vendors.map((v) => (
              <li key={v.id}>
                <Link href={`/portal/${v.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-raised">
                  <span><span className="font-medium">{v.displayName}</span><span className="ml-2 text-xs text-ink-mute">{v.contacts[0]?.phone}</span></span>
                  <span className="text-xs text-ink-mute">{v.status === "ACTIVE" ? "→" : v.status.toLowerCase().replace("_", " ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 rounded-md border border-rule p-4 text-center text-sm">
          <span className="text-ink-soft">New supplier?</span>{" "}
          <Link href="/portal/register" className="font-semibold text-poster hover:underline">Register your business →</Link>
        </div>
        <Link href="/" className="mt-5 block text-center text-xs text-ink-mute hover:text-poster">← Back to school ERP</Link>
      </div>
    </div>
  );
}
