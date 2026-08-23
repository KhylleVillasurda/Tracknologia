import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireProviderContext } from "@/features/auth";
import { createClient } from "@/lib/supabase/server";

import {
  getRepairCountRecords,
  getRepairRecord,
  listRepairRecords,
} from "./persistence";
import { repairIdSchema, repairListOptionsSchema } from "./schemas";
import type {
  RepairCounts,
  RepairDetail,
  RepairListOptions,
  RepairPage,
} from "./types";

export async function listRepairs(
  options: RepairListOptions = {},
  client?: SupabaseClient,
): Promise<RepairPage> {
  const parsed = repairListOptionsSchema.safeParse(options);
  if (!parsed.success) {
    throw new Error("Invalid Repair list options");
  }

  const supabase = client ?? (await createClient());
  const context = await requireProviderContext(supabase);
  return listRepairRecords(supabase, context.providerId, parsed.data);
}

export async function getRepair(
  repairId: string,
  client?: SupabaseClient,
): Promise<RepairDetail | null> {
  const id = repairIdSchema.safeParse(repairId);
  if (!id.success) {
    return null;
  }

  const supabase = client ?? (await createClient());
  const context = await requireProviderContext(supabase);
  return getRepairRecord(supabase, context.providerId, id.data);
}

export async function getRepairCounts(
  client?: SupabaseClient,
): Promise<RepairCounts> {
  const supabase = client ?? (await createClient());
  const context = await requireProviderContext(supabase);
  return getRepairCountRecords(supabase, context.providerId);
}
