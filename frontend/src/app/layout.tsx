import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { UserProvider } from "@/components/UserContext";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Greenfield School ERP · Inventory",
  description: "Vendor management and procurement for school inventory",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <UserProvider>
          {/* Client hooks that read the URL (usePathname/useParams) must stream under Suspense with Cache Components. */}
          <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading…</div>}>
            <AppShell>{children}</AppShell>
          </Suspense>
        </UserProvider>
      </body>
    </html>
  );
}
