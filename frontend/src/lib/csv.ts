import type { Vendor } from "./types";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote everything and neutralise spreadsheet formula injection (=, +, -, @ at the start).
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, rows: unknown[][]) {
  // BOM so Excel opens UTF-8 (₹, Tamil names) correctly.
  const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Vendor directory export. Bank account numbers are never included. */
export function downloadVendorsCsv(vendors: Vendor[], categoryNames: Record<string, string> = {}) {
  const header = ["Code", "Legal name", "Trade name", "Status", "Type", "Categories", "City", "GSTIN", "PAN",
    "Contact", "Phone", "Email", "Payment terms", "Lead time (days)", "Score", "Rating", "Response %", "On-time %", "Quality %"];
  const rows = vendors.map((v) => {
    const c = v.contacts[0];
    const p = v.performance;
    return [v.code, v.legalName, v.tradeName, v.status, v.type, v.categoryIds.map((id) => categoryNames[id] ?? id).join("; "),
      v.city, v.gstin, v.pan, c?.name, c?.phone, c?.email, v.paymentTerms, v.leadTimeDays,
      p.overallScore, p.manualRating, p.responseRatePct, p.onTimeDeliveryPct, p.qualityAcceptancePct];
  });
  downloadCsv(`vendors-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
}
