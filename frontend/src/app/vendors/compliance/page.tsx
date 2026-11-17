"use client";

import Link from "next/link";
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, StatusBadge } from "@/components/ui";
import { date, label } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { ExpiringDoc, Vendor } from "@/lib/types";

export default function CompliancePage() {
  const { data: docs, error } = useApi<ExpiringDoc[]>("/vendors/expiring-documents?days=60");
  const { data: vendors } = useApi<Vendor[]>("/vendors");
  if (error) return <ErrorBox message={error} />;
  if (!docs || !vendors) return <Loading />;

  const pending = vendors.filter((v) => ["PENDING_VERIFICATION", "INVITED", "SENT_BACK", "REGISTERED"].includes(v.status));
  const blocked = vendors.filter((v) => ["SUSPENDED", "BLACKLISTED"].includes(v.status));
  const bank = vendors.filter((v) => v.pendingBankChange);
  const legal = vendors.filter((v) => v.pendingIdentityChange);

  return (
    <>
      <PageHeader title="Vendor compliance" subtitle="Document expiry, onboarding queue, bank-change approvals and blocked vendors" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Documents expiring within 60 days" bodyClass="p-0">
          {docs.length === 0 ? <Empty>Nothing expiring soon.</Empty> : (
            <table className="min-w-full">
              <thead className="bg-raised"><tr><th className="th">Vendor</th><th className="th">Document</th><th className="th">Expiry</th></tr></thead>
              <tbody className="divide-y divide-rule">
                {docs.map((d) => (
                  <tr key={d.vendorId + d.type}>
                    <td className="td"><Link className="font-medium hover:text-poster" href={`/vendors/${d.vendorId}`}>{d.vendorName}</Link></td>
                    <td className="td">{label(d.type)}</td>
                    <td className="td">
                      {date(d.expiryDate)}{" "}
                      <Badge tone={d.daysToExpiry < 0 ? "red" : d.daysToExpiry <= 15 ? "amber" : "gray"}>
                        {d.daysToExpiry < 0 ? "Expired" : `${d.daysToExpiry}d`}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Onboarding queue" bodyClass="p-0">
          {pending.length === 0 ? <Empty>No vendors waiting.</Empty> : (
            <ul className="divide-y divide-rule">
              {pending.map((v) => (
                <li key={v.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <Link href={`/vendors/${v.id}`} className="font-medium hover:text-poster">{v.displayName}<span className="ml-2 text-xs font-normal text-ink-mute">{v.city}</span></Link>
                  <StatusBadge status={v.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Bank changes awaiting approval" bodyClass="p-0">
          {bank.length === 0 ? <Empty>None.</Empty> : (
            <ul className="divide-y divide-rule">
              {bank.map((v) => (
                <li key={v.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <Link href={`/vendors/${v.id}`} className="font-medium hover:text-poster">{v.displayName}</Link>
                  <span className="font-mono text-xs">{v.bank?.maskedAccountNumber} → {v.pendingBankChange?.maskedAccountNumber}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Legal changes awaiting re-verification" bodyClass="p-0">
          {legal.length === 0 ? <Empty>None.</Empty> : (
            <ul className="divide-y divide-rule">
              {legal.map((v) => (
                <li key={v.id} className="px-5 py-3 text-sm">
                  <Link href={`/vendors/${v.id}`} className="font-medium hover:text-poster">{v.displayName}</Link>
                  <div className="mt-0.5 text-xs text-ink-mute">{v.legalName} → {v.pendingIdentityChange?.legalName} · {v.pendingIdentityChange?.reason}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Suspended & blacklisted" bodyClass="p-0">
          {blocked.length === 0 ? <Empty>None.</Empty> : (
            <ul className="divide-y divide-rule">
              {blocked.map((v) => (
                <li key={v.id} className="px-5 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <Link href={`/vendors/${v.id}`} className="font-medium hover:text-poster">{v.displayName}</Link>
                    <StatusBadge status={v.status} />
                  </div>
                  <div className="mt-0.5 text-xs text-ink-mute">{v.statusReason}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
