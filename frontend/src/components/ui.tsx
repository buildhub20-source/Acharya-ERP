"use client";

import Link from "next/link";
import { useEffect } from "react";
import { label } from "@/lib/format";

const TONES: Record<string, string> = {
  green: "bg-ok/10 text-ok ring-ok/20",
  blue: "bg-info/10 text-info ring-info/20",
  indigo: "bg-poster/10 text-poster ring-poster/20",
  amber: "bg-warn/10 text-warn ring-warn/20",
  red: "bg-danger/10 text-danger ring-danger/20",
  gray: "bg-raised-2 text-ink-soft ring-ink-mute/20",
  purple: "bg-accent-2/10 text-accent-2 ring-accent-2/20",
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
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 font-sans text-[10.5px] font-semibold uppercase tracking-wide normal-nums ring-1 ring-inset ${TONES[tone]}`}>
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
        <Link href={back.href} className="mb-2 inline-block text-sm text-ink-mute hover:text-poster">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-ink-mute">{subtitle}</div>}
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
        <div className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3.5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink">{title}</h2>
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
  const color = { slate: "text-ink", indigo: "text-poster", emerald: "text-ok", amber: "text-warn", rose: "text-danger" }[tone];
  const body = (
    <div className={`card h-full p-4 transition ${href ? "hover:border-poster/50" : ""}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">{label}</div>
      <div className={`mt-2 font-display text-[28px] leading-none tracking-wide tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-mute">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function ErrorBox({ message, onClose }: { message: string | null; onClose?: () => void }) {
  if (!message) return null;
  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
      <span>{message}</span>
      {onClose && (
        <button onClick={onClose} className="text-danger hover:text-danger" aria-label="Dismiss">✕</button>
      )}
    </div>
  );
}

export function Loading({ text = "Loading…" }: { text?: string }) {
  return <div className="py-16 text-center text-sm text-ink-mute">{text}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-10 text-center text-sm text-ink-mute">{children}</div>;
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh]" onClick={onClose}>
      <div className={`card w-full ${wide ? "max-w-3xl" : "max-w-lg"}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="flex items-center justify-between border-b border-rule px-5 py-3.5">
          <h3 className="font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="text-ink-mute hover:text-ink-soft" aria-label="Close">✕</button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-rule px-5 py-3">{footer}</div>}
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
      {hint && <span className="mt-1 block text-xs text-ink-mute">{hint}</span>}
    </label>
  );
}

export function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="whitespace-nowrap text-poster" title={`${value} / 5`}>
      {"★".repeat(full)}
      <span className="text-ink-faint">{"★".repeat(5 - full)}</span>
      <span className="ml-1 text-xs text-ink-mute">{value ? value.toFixed(1) : "—"}</span>
    </span>
  );
}

export function ScoreBar({ value }: { value: number }) {
  const color = value >= 85 ? "bg-ok" : value >= 70 ? "bg-warn" : "bg-danger";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-raised-2">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="text-xs tabular-nums text-ink-soft">{value.toFixed(0)}</span>
    </div>
  );
}

export function ChannelChip({ channel }: { channel: string }) {
  const map: Record<string, string> = { EMAIL: "✉ Email", WHATSAPP: "◉ WhatsApp", SMS: "✆ SMS", PORTAL: "⌂ Portal" };
  return <span className="rounded bg-raised-2 px-1.5 py-0.5 text-[11px] text-ink-soft">{map[channel] ?? channel}</span>;
}
