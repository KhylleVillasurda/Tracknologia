import type { Metadata } from "next";

import { requireProviderContext } from "@/features/auth";
import {
  getProvider,
  getProviderServiceModes,
  getProviderUserProfile,
} from "@/features/providers";
import { createClient } from "@/lib/supabase/server";

import { SettingsClient } from "./_components/settings-client";

export const metadata: Metadata = {
  title: "Provider Settings — Tracknologia",
  description: "Manage Provider operating and personal profile settings",
};

export default async function ProviderSettingsPage() {
  const supabase = await createClient();
  const context = await requireProviderContext(supabase);
  const [provider, personalProfile, serviceModes] = await Promise.all([
    getProvider(context.providerId, supabase),
    getProviderUserProfile(context.userId, supabase),
    getProviderServiceModes(context.providerId, supabase),
  ]);

  if (!provider || !personalProfile) {
    throw new Error("Provider settings could not be loaded");
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Provider Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your personal identity and the operating details customers can
          use to understand this Provider.
        </p>
      </div>

      <SettingsClient
        provider={provider}
        personalProfile={personalProfile}
        serviceModes={serviceModes}
        canManageProvider={context.role === "OWNER"}
      />
    </div>
  );
}
