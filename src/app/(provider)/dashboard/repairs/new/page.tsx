import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { requireProviderContext } from "@/features/auth";
import { getProviderServiceModes } from "@/features/providers";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

import { CreateRepairForm } from "./_components/create-repair-form";

export const metadata: Metadata = {
  title: "Create Repair — Tracknologia",
  description: "Create a direct Provider Repair",
};

export default async function NewRepairPage() {
  const supabase = await createClient();
  const context = await requireProviderContext(supabase);
  const serviceModes = await getProviderServiceModes(
    context.providerId,
    supabase,
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link
          href="/dashboard/repairs"
          className={cn(
            buttonVariants({ variant: "link", size: "sm" }),
            "-ml-3 mb-1",
          )}
        >
          ← Back to Repairs
        </Link>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Create Repair
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use this for walk-in, meetup, home-service, or other direct intake.
        </p>
      </div>

      <CreateRepairForm serviceModes={serviceModes} />
    </div>
  );
}
