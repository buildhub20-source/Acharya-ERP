"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, ChannelChip, Empty, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Channel, OutboxMessage } from "@/lib/types";

export default function OutboxPage() {
  const { data, error, reload } = useApi<OutboxMessage[]>("/outbox?limit=200");
  const [channel, setChannel] = useState<Channel | "">("");
  const [open, setOpen] = useState<number | null>(null);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;
  const rows = data.filter((m) => !channel || m.channel === channel);

  return (
    <>
      <PageHeader title="Message outbox"
        subtitle="Mock delivery log: everything the system would send by email, WhatsApp, SMS or portal. Real gateways plug in here later."
        actions={<button className="btn-secondary" onClick={reload}>Refresh</button>} />
      <div className="mb-4 flex gap-1.5">
        {(["", "EMAIL", "WHATSAPP", "SMS", "PORTAL"] as const).map((c) => (
          <button key={c || "all"} onClick={() => setChannel(c)}
            className={`rounded-full px-3 py-1 text-xs ${channel === c ? "bg-poster font-semibold text-poster-ink" : "bg-panel text-ink-soft ring-1 ring-rule"}`}>
            {c ? c[0] + c.slice(1).toLowerCase() : "All"}
          </button>
        ))}
      </div>
      <Card bodyClass="p-0">
        {rows.length === 0 ? <Empty>No messages.</Empty> : (
          <ul className="divide-y divide-rule">
            {rows.map((m, i) => (
              <li key={i} className="cursor-pointer px-5 py-3 hover:bg-raised" onClick={() => setOpen(open === i ? null : i)}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <ChannelChip channel={m.channel} />
                  <Link href={`/vendors/${m.vendorId}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-poster">{m.vendorName}</Link>
                  <span className="text-xs text-ink-mute">{m.to}</span>
                  <span className="text-ink-soft">· {m.subject}</span>
                  <span className="ml-auto text-xs text-ink-mute">{dateTime(m.at)}</span>
                </div>
                {open === i && <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-raised p-3 font-sans text-xs text-ink-soft">{m.body}</pre>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
