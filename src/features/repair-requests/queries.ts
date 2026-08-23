import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireProviderContext } from "@/features/auth";
import { createClient } from "@/lib/supabase/server";

import {
  getRepairRequestRecord,
  listRepairRequestRecords,
} from "./persistence";
import { repairRequestFilterSchema, repairRequestIdSchema } from "./schemas";
import type {
  RepairRequestDetail,
  RepairRequestFilter,
  RepairRequestSummary,
} from "./types";

export async function listRepairRequests(
  filter: RepairRequestFilter = {},
  client?: SupabaseClient,
): Promise<RepairRequestSummary[]> {
  const parsed = repairRequestFilterSchema.safeParse(filter);
  if (!parsed.success) {
    throw new Error("Invalid Repair Request filter");
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
