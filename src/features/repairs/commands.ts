import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProviderContext } from "@/features/auth";
import { createClient } from "@/lib/supabase/server";

import { createRepairFromRequestRecord } from "./persistence";
import { requestOriginRepairSchema } from "./schemas";
import type { RequestOriginRepairInput, RepairResult } from "./types";

function optional(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

/**
 * Creates the authoritative Repair side of an accepted Request. The caller is
 * the Repair Requests Module, which supplies trusted Provider context.
 */
export async function createRepairFromRequest(
  _context: ProviderContext,
  requestId: string,
  input: RequestOriginRepairInput,
  client?: SupabaseClient,
): Promise<RepairResult> {
  const parsed = requestOriginRepairSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Invalid Request-origin Repair input",
    );
  }

  const supabase = client ?? (await createClient());
  return createRepairFromRequestRecord(supabase, requestId, {
    customerName: parsed.data.customerName,
    customerPhone: parsed.data.customerPhone,
    customerEmail: optional(parsed.data.customerEmail),
    deviceType: parsed.data.deviceType,
    brand: optional(parsed.data.brand),
    model: optional(parsed.data.model),
    serialNumber: optional(parsed.data.serialNumber),
    colorVariant: optional(parsed.data.colorVariant),
    deviceSpecs: optional(parsed.data.deviceSpecs),
    physicalCondition: optional(parsed.data.physicalCondition),
    accessoriesReceived: optional(parsed.data.accessoriesReceived),
    reportedProblem: parsed.data.reportedProblem,
    initialObservation: optional(parsed.data.initialObservation),
    diagnosis: optional(parsed.data.diagnosis),
    internalNotes: optional(parsed.data.internalNotes),
    serviceMode: parsed.data.serviceMode || undefined,
    serviceModeDetails: optional(parsed.data.serviceModeDetails),
  });
}
