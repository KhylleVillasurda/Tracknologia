import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  publicRepairProjectionSchema,
  type PublicRepairProjection,
} from "./schemas";

export async function lookupPublicRepairRecord(
  supabase: SupabaseClient,
  trackingCode: string,
): Promise<PublicRepairProjection | null> {
  const { data, error } = await supabase.rpc("lookup_public_repair", {
    p_tracking_code: trackingCode,
  });

  if (error) {
    throw new Error("Public Tracking lookup failed");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return null;
  }

  const parsed = publicRepairProjectionSchema.safeParse(row);
  if (!parsed.success) {
    throw new Error("Public Tracking projection is invalid");
  }

  return parsed.data;
}
