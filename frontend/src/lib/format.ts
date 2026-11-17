const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export const money = (v: number | null | undefined, whole = false) =>
  v === null || v === undefined ? "—" : (whole ? inr0 : inr).format(v);

export const date = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export const dateTime = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";

export const timeAgo = (v: string | null | undefined) => {
  if (!v) return "—";
  const diff = (Date.now() - new Date(v).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const ACRONYMS = /\b(po|rfq|gst|pan|msme|fssai)\b/g;

export const label = (v: string | null | undefined) =>
  v
    ? v
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(ACRONYMS, (m) => m.toUpperCase())
        .replace(/^\w/, (c) => c.toUpperCase())
    : "—";

export const terms = (v: string | null | undefined) =>
  ({ ADVANCE: "Advance", NET_15: "Net 15 days", NET_30: "Net 30 days", COD: "Cash on delivery" } as Record<string, string>)[
    v ?? ""
  ] ?? (v || "—");

/** Local "yyyy-MM-ddTHH:mm" for <input type="datetime-local"> and LocalDateTime. */
export const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
