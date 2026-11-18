"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Card, ChannelChip, Empty, ErrorBox, Field, Loading, PageHeader, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import type { AllowlistStatus, Channel, ChannelStatus, OutboxMessage } from "@/lib/types";

type ExtChannel = Exclude<Channel, "PORTAL">;
const CHANNELS: ExtChannel[] = ["EMAIL", "WHATSAPP", "SMS"];
const PLACEHOLDER: Record<ExtChannel, string> = { EMAIL: "you@example.com", WHATSAPP: "98400 12345", SMS: "98400 12345" };

export default function MessagesPage() {
  const { data, error, reload } = useApi<OutboxMessage[]>("/outbox?limit=200");
  const { data: status, reload: reloadStatus } = useApi<(ChannelStatus | AllowlistStatus)[]>("/channels");
  const [channel, setChannel] = useState<Channel | "">("");
  const [direction, setDirection] = useState<"" | "INBOUND" | "OUTBOUND">("");
  const [open, setOpen] = useState<string | null>(null);
  const refresh = () => { reload(); reloadStatus(); };

  if (error) return <ErrorBox message={error} />;
  if (!data || !status) return <Loading />;
  const channels = status.filter((s): s is ChannelStatus => s.channel !== "ALLOWLIST");
  const allow = status.find((s): s is AllowlistStatus => s.channel === "ALLOWLIST");
  const rows = data.filter((m) => (!channel || m.channel === channel) && (!direction || m.direction === direction));

  return (
    <>
      <PageHeader title="Messages"
        subtitle="Every RFQ, reminder and order goes out on the vendor's own preferred channel, and their reply is read back from that same channel."
        actions={<button className="btn-secondary" onClick={refresh}>Refresh</button>} />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {channels.map((c) => (
          <Card key={c.channel} title={<span className="flex items-center gap-2"><ChannelChip channel={c.channel} />{c.live ? <Badge tone="green">Live</Badge> : <Badge>Mock</Badge>}</span>}>
            <div className="space-y-1 text-xs text-slate-600">
              <div><span className="text-slate-400">Sends via</span> {c.provider === "mock" ? "not configured (logged only)" : c.provider}</div>
              <div><span className="text-slate-400">Replies via</span> {c.inbound}</div>
            </div>
          </Card>
        ))}
      </div>
      {allow && !allow.allowAll && (
        <div className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          Test safety is on: live messages only go to {allow.allowed.length ? allow.allowed.join(", ") : "nobody yet"}.
          Others are logged as <b>Blocked</b>. Set <code>MESSAGING_ALLOWED_RECIPIENTS</code>, or <code>MESSAGING_ALLOW_ALL=true</code> for real vendors.
        </div>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <TestSend onDone={refresh} />
        <SimulateReply onDone={refresh} />
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {(["", "EMAIL", "WHATSAPP", "SMS", "PORTAL"] as const).map((c) => (
          <Pill key={c || "all"} on={channel === c} onClick={() => setChannel(c)}>{c ? c[0] + c.slice(1).toLowerCase() : "All channels"}</Pill>
        ))}
        <span className="mx-2 border-l border-slate-200" />
        {([["", "Both ways"], ["OUTBOUND", "Sent"], ["INBOUND", "Replies"]] as const).map(([d, l]) => (
          <Pill key={l} on={direction === d} onClick={() => setDirection(d)}>{l}</Pill>
        ))}
      </div>
      <Card bodyClass="p-0">
        {rows.length === 0 ? <Empty>No messages.</Empty> : (
          <ul className="divide-y divide-slate-100">
            {rows.map((m) => (
              <li key={m.id} className={`cursor-pointer px-5 py-3 hover:bg-slate-50 ${m.direction === "INBOUND" ? "bg-sky-50/40" : ""}`}
                onClick={() => setOpen(open === m.id ? null : m.id)}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span title={m.direction === "INBOUND" ? "Reply from vendor" : "Sent to vendor"}
                    className={`text-xs font-semibold ${m.direction === "INBOUND" ? "text-sky-600" : "text-slate-400"}`}>
                    {m.direction === "INBOUND" ? "← IN" : "OUT →"}
                  </span>
                  <ChannelChip channel={m.channel} />
                  {m.vendorId
                    ? <Link href={`/vendors/${m.vendorId}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-indigo-600">{m.vendorName}</Link>
                    : <span className="font-medium text-slate-500">{m.vendorName ?? "Unknown sender"}</span>}
                  <span className="text-xs text-slate-400">{m.to}</span>
                  {m.subject && <span className="text-slate-600">· {m.subject}</span>}
                  <span className="ml-auto flex items-center gap-2">
                    <StatusBadge status={m.status} />
                    <span className="text-xs text-slate-400">{dateTime(m.at)}</span>
                  </span>
                </div>
                {m.error && <div className="mt-1 text-xs text-rose-600">{m.error}</div>}
                {open === m.id && (
                  <div className="mt-2 space-y-1">
                    <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-xs text-slate-600">{m.body || "(no text)"}</pre>
                    <div className="text-[11px] text-slate-400">
                      via {m.provider}{m.attachmentName && ` · attachment ${m.attachmentName}`}{m.providerMessageId && ` · id ${m.providerMessageId}`}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs ${on ? "bg-indigo-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
      {children}
    </button>
  );
}

function ChannelPicker({ value, onChange }: { value: ExtChannel; onChange: (c: ExtChannel) => void }) {
  return (
    <div className="flex gap-1.5">
      {CHANNELS.map((c) => <Pill key={c} on={value === c} onClick={() => onChange(c)}>{c[0] + c.slice(1).toLowerCase()}</Pill>)}
    </div>
  );
}

/** Check a provider's credentials by sending yourself a message. */
function TestSend({ onDone }: { onDone: () => void }) {
  const { busy, error, setError, run } = useAction();
  const [ch, setCh] = useState<ExtChannel>("EMAIL");
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState("Test from the school ERP: if you can read this, the channel works.");
  const [result, setResult] = useState<OutboxMessage | null>(null);
  const send = async () => {
    const r = await run(() => api.post<OutboxMessage>("/channels/test", { channel: ch, to, message: msg }));
    if (r) { setResult(r); onDone(); }
  };
  return (
    <Card title="Send a test message">
      <div className="space-y-3">
        <ErrorBox message={error} onClose={() => setError(null)} />
        <ChannelPicker value={ch} onChange={setCh} />
        <Field label="To"><input className="input" placeholder={PLACEHOLDER[ch]} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Message"><textarea className="input min-h-16" value={msg} onChange={(e) => setMsg(e.target.value)} /></Field>
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={busy || !to.trim() || !msg.trim()} onClick={send}>Send</button>
          {result && <span className="text-xs"><StatusBadge status={result.status} /> {result.error}</span>}
        </div>
      </div>
    </Card>
  );
}

/** Feed in a vendor reply exactly as the webhook / mailbox would, to test matching without a public URL. */
function SimulateReply({ onDone }: { onDone: () => void }) {
  const { busy, error, setError, run } = useAction();
  const [ch, setCh] = useState<ExtChannel>("WHATSAPP");
  const [from, setFrom] = useState("");
  const [text, setText] = useState("Sir we can supply at Rs 1450 per piece + GST 12%. Delivery in 10 days. Free delivery.");
  const [result, setResult] = useState<OutboxMessage | null>(null);
  const send = async () => {
    const r = await run(() => api.post<OutboxMessage>("/channels/simulate-inbound", { channel: ch, from, text, subject: null }));
    if (r) { setResult(r); onDone(); }
  };
  return (
    <Card title="Simulate a vendor reply">
      <div className="space-y-3">
        <ErrorBox message={error} onClose={() => setError(null)} />
        <ChannelPicker value={ch} onChange={setCh} />
        <Field label="From (the vendor's contact)" hint="Only counts if this vendor was sent an open RFQ on this same channel.">
          <input className="input" placeholder={PLACEHOLDER[ch]} value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Reply text"><textarea className="input min-h-16" value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={busy || !from.trim() || !text.trim()} onClick={send}>Receive</button>
          {result && <span className="text-xs"><StatusBadge status={result.status} /> {result.error ?? (result.vendorName && `matched ${result.vendorName}`)}</span>}
        </div>
      </div>
    </Card>
  );
}
