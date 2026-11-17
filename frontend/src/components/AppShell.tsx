"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { GradusLockup } from "./Brand";
import { USERS, useUser } from "./UserContext";

const NAV = [
  { section: "Overview", items: [{ href: "/", label: "Dashboard", icon: "▦" }] },
  {
    section: "Vendor Management",
    items: [
      { href: "/vendors", label: "Vendors", icon: "◫" },
      { href: "/vendors/categories", label: "Categories", icon: "▤" },
      { href: "/vendors/compliance", label: "Compliance", icon: "⚑" },
      { href: "/vendors/reports", label: "Reports", icon: "◔" },
    ],
  },
  {
    section: "Procurement",
    items: [
      { href: "/procurement", label: "Purchase Requests", icon: "☰" },
      { href: "/approvals", label: "Approvals", icon: "✓" },
      { href: "/purchase-orders", label: "Purchase Orders", icon: "▤" },
      { href: "/outbox", label: "Message Outbox", icon: "✉" },
    ],
  },
  {
    section: "Inventory",
    items: [
      { href: "/inventory", label: "Stock", icon: "▥" },
      { href: "/inventory/receipts", label: "Goods Receipt (GRN)", icon: "⇣" },
      { href: "/inventory/movements", label: "Stock Ledger", icon: "≡" },
    ],
  },
  { section: "External", items: [{ href: "/portal", label: "Vendor Portal", icon: "⌂" }] },
];

const noopSubscribe = () => () => {};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, setUser } = useUser();
  const [open, setOpen] = useState(false);
  // False while this boundary hydrates (matches server HTML), true afterwards. The user switcher
  // renders the server default until then, because React won't patch a <select> value at hydration.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const shownUser = hydrated ? user : USERS[0];

  // The vendor portal is a separate, vendor-facing experience.
  if (pathname.startsWith("/portal")) return <>{children}</>;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || (pathname.startsWith(href + "/") && !NAV.some(
      (s) => s.items.some((i) => i.href !== href && i.href.startsWith(href) && pathname.startsWith(i.href)),
    ));

  return (
    <div className="flex min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-rule bg-panel transition md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center border-b border-rule px-5">
          <Link href="/" aria-label="GradusMind home"><GradusLockup product="School ERP" /></Link>
        </div>
        <nav className="space-y-5 p-3">
          {NAV.map((s) => (
            <div key={s.section}>
              <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-mute">{s.section}</div>
              {s.items.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                    isActive(i.href)
                      ? "bg-poster/10 font-semibold text-poster shadow-[inset_3px_0_0_var(--color-poster)]"
                      : "text-ink-soft hover:bg-raised hover:text-ink"
                  }`}
                >
                  <span className="w-4 text-center opacity-70">{i.icon}</span>
                  {i.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-rule bg-panel/90 px-4 backdrop-blur md:px-8">
          <button className="btn-ghost md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
          <div className="hidden items-center gap-3 text-sm md:flex">
            <span className="font-semibold text-ink">Greenfield Public School</span>
            <span className="text-ink-mute">AY 2026–27</span>
            <span className="rounded-full bg-poster px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-poster-ink">Mock data</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-ink-mute sm:inline">Acting as</span>
            <select
              key={shownUser.name}
              className="input w-auto py-1.5"
              value={shownUser.name}
              onChange={(e) => setUser(USERS.find((u) => u.name === e.target.value)!)}
              aria-label="Switch user"
            >
              {USERS.map((u) => (
                <option key={u.name} value={u.name}>{u.name}</option>
              ))}
            </select>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
