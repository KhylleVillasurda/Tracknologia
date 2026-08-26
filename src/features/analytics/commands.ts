import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createPublicOperationClient } from "@/lib/supabase/service";

import { persistSuccessfulTrackingView } from "./persistence";

export async function recordSuccessfulTrackingView(
  trackingCode: string,
  client?: SupabaseClient,
): Promise<boolean> {
  try {
    const supabase = client ?? (await createPublicOperationClient());
    await persistSuccessfulTrackingView(supabase, trackingCode);
    return true;
  } catch {
    console.error("Analytics Tracking-view observation failed");
    return false;
  }
}
