"use client";

import Link from "next/link";
import { ErrorBox, Loading } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import type { Vendor } from "@/lib/types";

/** Mock vendor login: pick a portal-enabled vendor. Replace with Supabase Auth (OTP). */
export default function PortalLogin() {
  const { data, error } = useApi<Vendor[]>("/vendors");
  const vendors = (data ?? []).filter((v) => v.portalEnabled);
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-indigo-50 p-4">
      <div className="card w-full max-w-md p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-600 font-bold text-white">G</div>
          <div>
            <h1 className="font-semibold text-slate-900">Greenfield Vendor Portal</h1>
            <p className="text-xs text-slate-500">Quotes, purchase orders and compliance documents</p>
          </div>
        </div>
        <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Demo sign-in: choose a vendor. In production vendors sign in with a mobile OTP.
        </div>
        <ErrorBox message={error} />
        {!data ? <Loading /> : (
          <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {vendors.map((v) => (
              <li key={v.id}>
                <Link href={`/portal/${v.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-slate-50">
                  <span><span className="font-medium">{v.displayName}</span><span className="ml-2 text-xs text-slate-500">{v.contacts[0]?.phone}</span></span>
                  <span className="text-xs text-slate-400">{v.status === "ACTIVE" ? "→" : v.status.toLowerCase().replace("_", " ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/" className="mt-5 block text-center text-xs text-slate-500 hover:text-indigo-600">← Back to school ERP</Link>
      </div>
    </div>
  );
}
