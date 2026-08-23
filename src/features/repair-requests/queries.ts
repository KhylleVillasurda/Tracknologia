import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireProviderContext } from "@/features/auth";
import { createClient } from "@/lib/supabase/server";

import {
  getRepairRequestRecord,
  listRepairRequestRecords,
} from "./persistence";
import {
  repairRequestIdSchema,
  repairRequestListOptionsSchema,
} from "./schemas";
import type {
  RepairRequestDetail,
  RepairRequestListOptions,
  RepairRequestPage,
} from "./types";

export async function listRepairRequests(
  options: RepairRequestListOptions = {},
  client?: SupabaseClient,
): Promise<RepairRequestPage> {
  const parsed = repairRequestListOptionsSchema.safeParse(options);
  if (!parsed.success) {
    throw new Error("Invalid Repair Request list options");
  }

  const supabase = client ?? (await createClient());
  const context = await requireProviderContext(supabase);
  return listRepairRequestRecords(supabase, context.providerId, parsed.data);
}

export async function getRepairRequest(
  requestId: string,
  client?: SupabaseClient,
): Promise<RepairRequestDetail | null> {
  const parsed = repairRequestIdSchema.safeParse(requestId);
  if (!parsed.success) {
    return null;
  }

  const supabase = client ?? (await createClient());
  const context = await requireProviderContext(supabase);
  return getRepairRequestRecord(supabase, context.providerId, parsed.data);
}
