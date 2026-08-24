import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireProviderContext, type ProviderContext } from "@/features/auth";
import { getProviderServiceModes } from "@/features/providers";
import { createClient } from "@/lib/supabase/server";

import {
  changeRepairStatusRecord,
  createProviderRepairRecord,
  createRepairFromRequestRecord,
  getRepairRecord,
  insertCustomerUpdateRecord,
  updateRepairRecord,
} from "./persistence";
import {
  changeRepairStatusSchema,
  customerUpdateSchema,
  directRepairSchema,
  repairIdSchema,
  requestOriginRepairSchema,
  updateRepairDetailsSchema,
} from "./schemas";
import type {
  CustomerUpdate,
  DirectRepairInput,
  RepairDetail,
  RepairResult,
  RepairSnapshotInput,
  RepairStatus,
  RequestOriginRepairInput,
  UpdateRepairDetailsInput,
} from "./types";
import { getAllowedRepairStatusTransitions, RepairError } from "./types";

function optional(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function normalizeRepairInput(input: RepairSnapshotInput): RepairSnapshotInput {
  return {
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone.trim(),
    customerEmail: optional(input.customerEmail)?.toLowerCase(),
    deviceType: input.deviceType.trim(),
    brand: optional(input.brand),
    model: optional(input.model),
    serialNumber: optional(input.serialNumber),
    colorVariant: optional(input.colorVariant),
    deviceSpecs: optional(input.deviceSpecs),
    physicalCondition: optional(input.physicalCondition),
    accessoriesReceived: optional(input.accessoriesReceived),
    reportedProblem: input.reportedProblem.trim(),
    initialObservation: optional(input.initialObservation),
    diagnosis: optional(input.diagnosis),
    internalNotes: optional(input.internalNotes),
    serviceMode: input.serviceMode,
    serviceModeDetails: optional(input.serviceModeDetails),
  };
}

function normalizeRepairUpdateInput(
  input: UpdateRepairDetailsInput,
  serviceMode: RepairSnapshotInput["serviceMode"],
): RepairSnapshotInput {
  return normalizeRepairInput({
    ...input,
    serviceMode,
  });
}

async function requireSupportedServiceMode(
  context: ProviderContext,
  serviceMode: RepairSnapshotInput["serviceMode"],
  supabase: SupabaseClient,
): Promise<void> {
  if (!serviceMode) {
    return;
  }

  const modes = await getProviderServiceModes(context.providerId, supabase);
  if (!modes.some((mode) => mode.mode === serviceMode)) {
    throw new RepairError(
      "Selected Service Mode is not supported by this Provider",
      "UNSUPPORTED_SERVICE_MODE",
    );
  }
}

async function requireOwnedRepair(
  context: ProviderContext,
  repairId: string,
  supabase: SupabaseClient,
): Promise<RepairDetail> {
  const repair = await getRepairRecord(supabase, context.providerId, repairId);
  if (!repair) {
    throw new RepairError("Repair was not found", "REPAIR_NOT_FOUND");
  }
  return repair;
}

export async function createRepair(
  input: DirectRepairInput,
  client?: SupabaseClient,
): Promise<RepairResult> {
  const parsed = directRepairSchema.safeParse(input);
  if (!parsed.success) {
    throw new RepairError(
      parsed.error.issues[0]?.message ?? "Invalid Repair input",
      "INVALID_INPUT",
    );
  }

  const supabase = client ?? (await createClient());
  const context = await requireProviderContext(supabase);
  await requireSupportedServiceMode(context, parsed.data.serviceMode, supabase);
  return createProviderRepairRecord(
    supabase,
    normalizeRepairInput(parsed.data),
  );
}

/**
 * Creates the authoritative Repair side of an accepted Request. The caller is
 * the Repair Requests Module; the transaction rechecks authenticated Provider
 * ownership at write time.
 */
export async function createRepairFromRequest(
  requestId: string,
  input: RequestOriginRepairInput,
  client?: SupabaseClient,
): Promise<RepairResult> {
  const parsed = requestOriginRepairSchema.safeParse(input);
  if (!parsed.success) {
    throw new RepairError(
      parsed.error.issues[0]?.message ?? "Invalid Request-origin Repair input",
      "INVALID_INPUT",
    );
  }

  const supabase = client ?? (await createClient());
  return createRepairFromRequestRecord(
    supabase,
    requestId,
    normalizeRepairInput(parsed.data),
  );
}

export async function updateRepairDetails(
  repairId: string,
  input: UpdateRepairDetailsInput,
  client?: SupabaseClient,
): Promise<RepairDetail> {
  const id = repairIdSchema.safeParse(repairId);
  const parsed = updateRepairDetailsSchema.safeParse(input);
  if (!id.success) {
    throw new RepairError("Repair was not found", "REPAIR_NOT_FOUND");
  }
  if (!parsed.success) {
    throw new RepairError(
      parsed.error.issues[0]?.message ?? "Invalid Repair details",
      "INVALID_INPUT",
    );
  }

  const supabase = client ?? (await createClient());
  const context = await requireProviderContext(supabase);
  const existing = await requireOwnedRepair(context, id.data, supabase);
  const existingServiceMode = existing.serviceMode ?? undefined;
  const effectiveServiceMode =
    parsed.data.serviceMode === undefined
      ? existingServiceMode
      : (parsed.data.serviceMode ?? undefined);

  if (!effectiveServiceMode && parsed.data.serviceModeDetails) {
    throw new RepairError(
      "Select a Service Mode before adding arrangement details",
      "INVALID_INPUT",
    );
  }

  if (
    parsed.data.serviceMode !== undefined &&
    effectiveServiceMode !== existingServiceMode
  ) {
    await requireSupportedServiceMode(context, effectiveServiceMode, supabase);
  }

  const updated = await updateRepairRecord(
    supabase,
    context.providerId,
    id.data,
    normalizeRepairUpdateInput(parsed.data, effectiveServiceMode),
  );
  if (!updated) {
    throw new RepairError("Repair was not found", "REPAIR_NOT_FOUND");
  }
  return updated;
}

export async function changeRepairStatus(
  repairId: string,
  nextStatus: Exclude<RepairStatus, "COMPLETED">,
  client?: SupabaseClient,
): Promise<RepairDetail> {
  const id = repairIdSchema.safeParse(repairId);
  const status = changeRepairStatusSchema.safeParse({ nextStatus });
  if (!id.success) {
    throw new RepairError("Repair was not found", "REPAIR_NOT_FOUND");
  }
  if (!status.success) {
    throw new RepairError("Invalid Repair status", "INVALID_INPUT");
  }

  const supabase = client ?? (await createClient());
  const context = await requireProviderContext(supabase);
  const repair = await requireOwnedRepair(context, id.data, supabase);
  if (
    !getAllowedRepairStatusTransitions(repair.currentStatus).includes(
      status.data.nextStatus,
    )
  ) {
    throw new RepairError(
      "Repair status can no longer be changed that way",
      "INVALID_STATUS_TRANSITION",
    );
  }

  await changeRepairStatusRecord(supabase, id.data, status.data.nextStatus);
  return requireOwnedRepair(context, id.data, supabase);
}

export async function completeRepair(
  repairId: string,
  client?: SupabaseClient,
): Promise<RepairDetail> {
  const id = repairIdSchema.safeParse(repairId);
  if (!id.success) {
    throw new RepairError("Repair was not found", "REPAIR_NOT_FOUND");
  }

  const supabase = client ?? (await createClient());
  const context = await requireProviderContext(supabase);
  const repair = await requireOwnedRepair(context, id.data, supabase);
  if (
    !getAllowedRepairStatusTransitions(repair.currentStatus).includes(
      "COMPLETED",
    )
  ) {
    throw new RepairError(
      "Only a READY Repair can be completed",
      "INVALID_STATUS_TRANSITION",
    );
  }

  await changeRepairStatusRecord(supabase, id.data, "COMPLETED");
  return requireOwnedRepair(context, id.data, supabase);
}

export async function addCustomerUpdate(
  repairId: string,
  message: string,
  client?: SupabaseClient,
): Promise<CustomerUpdate> {
  const id = repairIdSchema.safeParse(repairId);
  const parsed = customerUpdateSchema.safeParse({ message });
  if (!id.success) {
    throw new RepairError("Repair was not found", "REPAIR_NOT_FOUND");
  }
  if (!parsed.success) {
    throw new RepairError(
      parsed.error.issues[0]?.message ?? "Invalid Customer Update",
      "INVALID_INPUT",
    );
  }

  const supabase = client ?? (await createClient());
  const context = await requireProviderContext(supabase);
  await requireOwnedRepair(context, id.data, supabase);
  return insertCustomerUpdateRecord(supabase, id.data, parsed.data.message);
}
