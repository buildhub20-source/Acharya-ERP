"use client";

import { useState } from "react";
import { Badge, Card, ChannelChip, ErrorBox, Field, Modal, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime, timeAgo } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { PurchaseRequestDetail, QuoteSource, Rfq } from "@/lib/types";

const PIPE: Rfq["status"][] = ["SENT", "DELIVERED", "READ", "REPLIED"];

const SAMPLE: Record<string, string> = {
  WHATSAPP_TEXT: "Hello sir, we can supply at Rs 735 per pair + GST 12%. Delivery within 6 days. Free delivery. Valid for 30 days.",
  EMAIL_TEXT: "Dear Sir/Madam,\nPlease find our quotation: Rate 760/- each, 12% GST extra. Delivery charges Rs 300. Lead time 8 working days. Payment Net 30.",
  PDF: "QUOTATION No. Q-2231\nItem: Sports shoes white\nRate: Rs 748.00 per pair\nGST @ 12%\nTransport charges: 200\nDelivery: 7 days\nValidity: 15 days",
  IMAGE: "(OCR) Sports Shoe ... Rs 699 ... 20 pairs ... 12 days",
  VOICE: "(transcript) sir rate is rs 710 per pair, delivery in 9 days, advance payment",
};

/** Step 5 (tracking + reminders) and step 6 entry point (log a vendor's raw reply). */
export default function RfqTracking({ detail, onChange }: { detail: PurchaseRequestDetail; onChange: () => void }) {
  const pr = detail.request;
  const rfqs = detail.rfqs.filter((r) => r.round === pr.round);
  const collecting = pr.status === "RFQ_SENT" || pr.status === "COLLECTING_QUOTES";
  const { busy, error, setError, run } = useAction();
  const [reply, setReply] = useState<{ rfq: Rfq; source: QuoteSource; text: string } | null>(null);
  const [preview, setPreview] = useState<Rfq | null>(null);

  const remind = async (r: Rfq) => { if (await run(() => api.post(`/rfqs/${r.id}/remind`))) onChange(); };
  const submitReply = async () => {
    if (!reply) return;
    const ok = await run(() => api.post(`/purchase-requests/${pr.id}/replies`, {
      rfqId: reply.rfq.id, source: reply.source, rawText: reply.text,
      attachmentName: reply.source === "PDF" ? "quotation.pdf" : reply.source === "IMAGE" ? "photo.jpg" : reply.source === "VOICE" ? "voice.ogg" : null,
    }));
    if (ok) { setReply(null); onChange(); }
  };

  const replied = rfqs.filter((r) => r.status === "REPLIED").length;
  return (
    <Card title={<>Vendor tracking · round {pr.round} <span className="ml-2 font-normal text-slate-500">{replied}/{rfqs.length} replied</span></>}
      bodyClass="p-0"
      actions={pr.quoteDeadline && <span className="text-xs text-slate-500">Deadline {dateTime(pr.quoteDeadline)}</span>}>
      <div className="px-5 pt-4"><ErrorBox message={error} onClose={() => setError(null)} /></div>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-slate-50">
            <tr><th className="th">Vendor</th><th className="th">Channels</th><th className="th">Progress</th><th className="th">Reminders</th><th className="th" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rfqs.map((r) => {
              const idx = PIPE.indexOf(r.status);
              return (
                <tr key={r.id}>
                  <td className="td">
                    <div className="font-medium">{r.vendorName}</div>
                    <button className="text-xs text-indigo-600 hover:underline" onClick={() => setPreview(r)}>{r.reference}</button>
                  </td>
                  <td className="td"><div className="flex flex-wrap gap-1">{r.channels.map((c) => <ChannelChip key={c} channel={c} />)}</div></td>
                  <td className="td">
                    {r.status === "NO_RESPONSE" ? <StatusBadge status="NO_RESPONSE" /> : (
                      <div className="flex items-center gap-1">
                        {PIPE.map((p, i) => (
                          <div key={p} className="flex items-center gap-1">
                            <span className={`rounded px-1.5 py-0.5 text-[11px] ${i <= idx ? (p === "REPLIED" ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800") : "bg-slate-100 text-slate-400"}`}>
                              {p[0] + p.slice(1).toLowerCase()}
                            </span>
                            {i < PIPE.length - 1 && <span className="text-slate-300">→</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-1 text-[11px] text-slate-400">
                      {r.repliedAt ? `Replied ${timeAgo(r.repliedAt)}` : r.readAt ? `Read ${timeAgo(r.readAt)}` : `Sent ${timeAgo(r.sentAt)}`}
                    </div>
                  </td>
                  <td className="td">
                    {r.reminderCount > 0 ? <Badge tone="amber">{r.reminderCount} sent</Badge> : <span className="text-xs text-slate-400">—</span>}
                  </td>
                  <td className="td text-right">
                    {collecting && r.status !== "REPLIED" && r.status !== "NO_RESPONSE" && (
                      <div className="flex justify-end gap-2">
                        <button className="btn-ghost px-2 py-1 text-xs" disabled={busy} onClick={() => remind(r)}>Remind</button>
                        <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setReply({ rfq: r, source: "WHATSAPP_TEXT", text: SAMPLE.WHATSAPP_TEXT })}>Log reply</button>
                      </div>
                    )}
                    {collecting && r.status === "REPLIED" && (
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setReply({ rfq: r, source: "WHATSAPP_TEXT", text: "" })}>Revised quote</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={!!reply} wide title={`Log reply from ${reply?.rfq.vendorName ?? ""}`} onClose={() => setReply(null)}
        footer={<><button className="btn-secondary" onClick={() => setReply(null)}>Cancel</button><button className="btn-primary" disabled={busy || !reply?.text.trim()} onClick={submitReply}>Parse & save quote</button></>}>
        {reply && (
          <div className="space-y-4">
            <Field label="Received as">
              <div className="flex flex-wrap gap-2">
                {(["WHATSAPP_TEXT", "EMAIL_TEXT", "PDF", "IMAGE", "VOICE"] as QuoteSource[]).map((s) => (
                  <button key={s} type="button"
                    onClick={() => setReply({ ...reply, source: s, text: reply.text && !Object.values(SAMPLE).includes(reply.text) ? reply.text : SAMPLE[s] })}
                    className={`rounded-full border px-3 py-1 text-xs ${reply.source === s ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-300 text-slate-600"}`}>
                    {{ WHATSAPP_TEXT: "WhatsApp text", EMAIL_TEXT: "Email", PDF: "PDF", IMAGE: "Image (OCR)", VOICE: "Voice note" }[s as string]}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Message / extracted text" hint="PDF and image text comes from OCR, voice from speech-to-text. The parser pulls out price, GST, delivery, validity and terms, and flags anything it is unsure of.">
              <textarea className="input min-h-32 font-mono text-xs" value={reply.text} onChange={(e) => setReply({ ...reply, text: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal open={!!preview} title={`${preview?.reference} → ${preview?.vendorName}`} onClose={() => setPreview(null)} wide>
        <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">{preview?.message}</pre>
      </Modal>
    </Card>
  );
}
