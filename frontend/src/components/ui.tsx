"use client";

import Link from "next/link";
import { useEffect } from "react";
import { label } from "@/lib/format";

const TONES: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  red: "bg-rose-50 text-rose-700 ring-rose-600/20",
  gray: "bg-slate-100 text-slate-600 ring-slate-500/20",
  purple: "bg-violet-50 text-violet-700 ring-violet-600/20",
};

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  // vendor
  ACTIVE: "green", INVITED: "blue", REGISTERED: "blue", PENDING_VERIFICATION: "amber", SENT_BACK: "amber",
  SUSPENDED: "red", BLACKLISTED: "red", REJECTED: "red", INACTIVE: "gray",
  // purchase request
  DRAFT: "gray", RFQ_SENT: "blue", COLLECTING_QUOTES: "blue", UNDER_REVIEW: "indigo", PENDING_APPROVAL: "amber",
  REJECTED_REQUOTE: "amber", APPROVED: "green", PO_ISSUED: "green", CANCELLED: "red",
  // rfq
  SENT: "gray", DELIVERED: "blue", READ: "indigo", REPLIED: "green", NO_RESPONSE: "red",
  // docs / po
  VERIFIED: "green", PENDING: "amber", ISSUED: "indigo", ACCEPTED: "blue", DISPATCHED: "purple",
  PARTIALLY_RECEIVED: "amber", RECEIVED: "green",
  // stock
  OK: "green", LOW: "amber", OUT: "red", OPENING: "gray", RECEIPT: "green", ISSUE: "blue", ADJUSTMENT: "purple", RETURN: "red",
  MATCHED: "green", MISMATCH: "red", NOT_PROVIDED: "gray",
  // portal outcomes
  OPEN: "blue", UNDER_EVALUATION: "indigo", WON: "green", NOT_SELECTED: "gray", CLOSED: "gray",
};

export function Badge({ children, tone = "gray" }: { children: React.ReactNode; tone?: keyof typeof TONES }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "gray"}>{label(status)}</Badge>;
}

export function PageHeader({
  title, subtitle, actions, back,
}: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-block text-sm text-slate-500 hover:text-indigo-600">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, actions, children, className = "", bodyClass = "p-5" }: {
  title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClass?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actions}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone = "slate", href }: {
  label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "slate" | "indigo" | "emerald" | "amber" | "rose"; href?: string;
}) {
  const color = { slate: "text-slate-900", indigo: "text-indigo-600", emerald: "text-emerald-600", amber: "text-amber-600", rose: "text-rose-600" }[tone];
  const body = (
    <div className="card h-full p-4 transition hover:shadow-md">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1.5 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function ErrorBox({ message, onClose }: { message: string | null; onClose?: () => void }) {
  if (!message) return null;
  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <span>{message}</span>
      {onClose && (
        <button onClick={onClose} className="text-rose-500 hover:text-rose-700" aria-label="Dismiss">✕</button>
      )}
    </div>
  );
}

export function Loading({ text = "Loading…" }: { text?: string }) {
  return <div className="py-16 text-center text-sm text-slate-500">{text}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-10 text-center text-sm text-slate-500">{children}</div>;
}

export function Modal({ open, title, onClose, children, footer, wide }: {
  open: boolean; title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-[8vh]" onClick={onClose}>
      <div className={`card w-full ${wide ? "max-w-3xl" : "max-w-lg"}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">✕</button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label: text, children, hint, className = "" }: {
  label: string; children: React.ReactNode; hint?: string; className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="field-label">{text}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="whitespace-nowrap text-amber-500" title={`${value} / 5`}>
      {"★".repeat(full)}
      <span className="text-slate-300">{"★".repeat(5 - full)}</span>
      <span className="ml-1 text-xs text-slate-500">{value ? value.toFixed(1) : "—"}</span>
    </span>
  );
}

export function ScoreBar({ value }: { value: number }) {
  const color = value >= 85 ? "bg-emerald-500" : value >= 70 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-600">{value.toFixed(0)}</span>
    </div>
  );
}

export function ChannelChip({ channel }: { channel: string }) {
  const map: Record<string, string> = { EMAIL: "✉ Email", WHATSAPP: "◉ WhatsApp", SMS: "✆ SMS", PORTAL: "⌂ Portal" };
  return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{map[channel] ?? channel}</span>;
}
