import type { Metadata } from "next";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPublicProvider } from "@/features/providers";

import { RepairRequestForm } from "./_components/repair-request-form";

export const metadata: Metadata = {
  title: "Submit Repair Request — Tracknologia",
  description: "Send device and problem information to a repair Provider",
};

export default async function PublicRepairRequestPage({
  params,
}: {
  params: Promise<{ providerSlug: string }>;
}) {
  const { providerSlug } = await params;
  const provider = await getPublicProvider(providerSlug);

  if (!provider) {
    return (
      <main className="min-h-screen bg-muted/30 px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-xl space-y-6">
          <Link href="/" className="text-xl font-bold tracking-tight">
            Tracknologia
          </Link>
          <Card>
            <CardHeader>
              <CardTitle>Repair Requests unavailable</CardTitle>
              <CardDescription>
                Provider does not exist or is not accepting new Requests.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Check link or contact Provider directly for current service
                options.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="text-xl font-bold tracking-tight">
            Tracknologia
          </Link>
          <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            Public Request
          </span>
        </div>

        <section className="rounded-2xl border border-border/80 bg-background p-5 shadow-xs sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Repair Provider
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Request repair service from {provider.displayName}
          </h1>
          {provider.description && (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {provider.description}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            {provider.publicAddress && <span>{provider.publicAddress}</span>}
            {provider.serviceArea && (
              <span>Service area: {provider.serviceArea}</span>
            )}
          </div>
        </section>

        <RepairRequestForm
          providerSlug={provider.slug}
          providerName={provider.displayName}
          supportedDevices={provider.supportedDevices}
          serviceModes={provider.serviceModes}
        />
      </div>
    </main>
  );
}
