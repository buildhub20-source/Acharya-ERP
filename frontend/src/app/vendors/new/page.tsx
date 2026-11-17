"use client";

import { PageHeader } from "@/components/ui";
import VendorForm from "@/components/VendorForm";

export default function NewVendorPage() {
  return (
    <>
      <PageHeader title="Add vendor" subtitle="Register a supplier, or send a portal invite so they complete their own profile."
        back={{ href: "/vendors", label: "Vendors" }} />
      <VendorForm />
    </>
  );
}
