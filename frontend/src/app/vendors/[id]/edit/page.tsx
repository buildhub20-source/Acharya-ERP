"use client";

import { useParams } from "next/navigation";
import { ErrorBox, Loading, PageHeader } from "@/components/ui";
import VendorForm from "@/components/VendorForm";
import { useApi } from "@/lib/hooks";
import type { Vendor } from "@/lib/types";

export default function EditVendorPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useApi<Vendor>(`/vendors/${id}`);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;
  return (
    <>
      <PageHeader title={`Edit ${data.displayName}`} subtitle={data.code} back={{ href: `/vendors/${id}`, label: data.displayName }} />
      <VendorForm vendor={data} />
    </>
  );
}
