import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function persistSuccessfulTrackingView(
  supabase: SupabaseClient,
  trackingCode: string,
): Promise<void> {
  const { error } = await supabase.rpc("record_successful_tracking_view", {
    p_tracking_code: trackingCode,
  });

  if (error) {
    throw new Error("Successful Tracking-view persistence failed");
  }
}
