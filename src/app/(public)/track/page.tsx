import type { Metadata } from "next";
import Link from "next/link";

import { TrackingForm } from "./_components/tracking-form";

export const metadata: Metadata = {
  title: "Track Repair or Request — Tracknologia",
  description:
    "Check customer-safe repair status and updates using your Tracking Code or Request Reference.",
};

export default async function TrackRepairPage({
  searchParams,
}: {
  searchParams?: Promise<{ code?: string }>;
}) {
  const params = await searchParams;
  const initialCode =
    typeof params?.code === "string" ? params.code.trim().toUpperCase() : "";

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="text-xl font-bold tracking-tight">
            Tracknologia
          </Link>
          <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            Public Tracking
          </span>
        </div>

        <section className="rounded-2xl border border-border/80 bg-background p-5 shadow-xs sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Track Repair or Request
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            See latest progress
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Enter the Tracking Code (TRK-...) or Request Reference (REQ-...)
            provided by your Repair Provider. No account or sign-in is required.
          </p>
        </section>

        <TrackingForm initialCode={initialCode} />

        <p className="px-2 text-center text-xs leading-relaxed text-muted-foreground">
          Tracking shows customer-safe progress only. Contact your Repair
          Provider if you need help with your code or service arrangement.
        </p>
      </div>
    </main>
  );
}
