import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CustomerUpdate,
  DirectRepairInput,
  RepairCounts,
  RepairDetail,
  RepairListOptions,
  RepairPage,
  RepairResult,
  RepairStatus,
  RepairStatusEvent,
  RepairSummary,
  RequestOriginRepairInput,
  UpdateRepairDetailsInput,
} from "./types";
import { RepairError } from "./types";

const REPAIR_PAGE_SIZE = 25;

const REPAIR_SUMMARY_COLUMNS =
  "id, ticket_number, origin, customer_name, device_type, brand, model, reported_problem, current_status, created_at, updated_at";

const REPAIR_DETAIL_COLUMNS =
  "id, provider_id, repair_request_id, origin, ticket_number, tracking_code, customer_name, customer_phone, customer_email, device_type, brand, model, serial_number, color_variant, device_specs, physical_condition, accessories_received, reported_problem, initial_observation, diagnosis, internal_notes, service_mode, service_mode_details, current_status, created_by_user_id, created_at, updated_at, completed_at";

function throwRepairPersistenceError(
  operation: string,
  message: string,
): never {
  if (message.includes("REQUEST_NOT_FOUND")) {
    throw new RepairError("Repair Request was not found", "REQUEST_NOT_FOUND");
  }

  if (message.includes("REQUEST_ALREADY_PROCESSED")) {
    throw new RepairError(
      "Repair Request has already been processed",
      "REQUEST_ALREADY_PROCESSED",
    );
  }

  if (message.includes("REPAIR_NOT_FOUND")) {
    throw new RepairError("Repair was not found", "REPAIR_NOT_FOUND");
  }

  if (message.includes("INVALID_STATUS_TRANSITION")) {
    throw new RepairError(
      "Repair status can no longer be changed that way",
      "INVALID_STATUS_TRANSITION",
    );
  }

  if (message.includes("UNSUPPORTED_SERVICE_MODE")) {
    throw new RepairError(
      "Selected Service Mode is not supported by this Provider",
      "UNSUPPORTED_SERVICE_MODE",
    );
  }

  if (message.includes("IDENTIFIER_GENERATION_FAILED")) {
    throw new RepairError(
      "Unable to generate unique Repair identifiers",
      "IDENTIFIER_GENERATION_FAILED",
    );
  }

  if (
    message.includes("INVALID_REPAIR_INPUT") ||
    message.includes("check_repairs_") ||
    message.includes("check_repair_updates_")
  ) {
    throw new RepairError("Repair details are invalid", "INVALID_INPUT");
  }

  throw new Error(`${operation}: ${message}`);
}

function repairRpcInput(input: DirectRepairInput | RequestOriginRepairInput) {
  return {
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_customer_email: input.customerEmail || null,
    p_device_type: input.deviceType,
    p_brand: input.brand || null,
    p_model: input.model || null,
    p_serial_number: input.serialNumber || null,
    p_color_variant: input.colorVariant || null,
    p_device_specs: input.deviceSpecs || null,
    p_physical_condition: input.physicalCondition || null,
    p_accessories_received: input.accessoriesReceived || null,
    p_reported_problem: input.reportedProblem,
    p_initial_observation: input.initialObservation || null,
    p_diagnosis: input.diagnosis || null,
    p_internal_notes: input.internalNotes || null,
    p_service_mode: input.serviceMode || null,
    p_service_mode_details: input.serviceModeDetails || null,
  };
}

function mapRepairReceipt(data: unknown, operation: string): RepairResult {
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.repair_id) {
    throw new Error(`${operation} returned no Repair`);
  }

  return {
    repairId: result.repair_id,
    ticketNumber: result.ticket_number,
    trackingCode: result.tracking_code,
    currentStatus: "IN_PROGRESS",
  };
}

export async function createProviderRepairRecord(
  supabase: SupabaseClient,
  input: DirectRepairInput,
): Promise<RepairResult> {
  const { data, error } = await supabase.rpc("create_provider_repair", {
    ...repairRpcInput(input),
  });

  if (error) {
    throwRepairPersistenceError(
      "Failed to create direct Provider Repair",
      error.message,
    );
  }

  return mapRepairReceipt(data, "Direct Provider Repair creation");
}

export async function createRepairFromRequestRecord(
  supabase: SupabaseClient,
  requestId: string,
  input: RequestOriginRepairInput,
): Promise<RepairResult> {
  const { data, error } = await supabase.rpc("create_repair_from_request", {
    p_request_id: requestId,
    ...repairRpcInput(input),
  });

  if (error) {
    throwRepairPersistenceError(
      "Failed to create Repair from Request",
      error.message,
    );
  }

  return mapRepairReceipt(data, "Request-origin Repair creation");
}

export async function listRepairRecords(
  supabase: SupabaseClient,
  providerId: string,
  options: RepairListOptions,
): Promise<RepairPage> {
  const page = options.page ?? 1;
  const offset = (page - 1) * REPAIR_PAGE_SIZE;
  let query = supabase
    .from("repairs")
    .select(REPAIR_SUMMARY_COLUMNS)
    .eq("provider_id", providerId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false });

  if (options.status) {
    query = query.eq("current_status", options.status);
  }

  if (options.query) {
    const pattern = `%${options.query}%`;
    query = query.or(
      [
        `ticket_number.ilike.${pattern}`,
        `customer_name.ilike.${pattern}`,
        `device_type.ilike.${pattern}`,
        `brand.ilike.${pattern}`,
        `model.ilike.${pattern}`,
      ].join(","),
    );
  }

  const { data, error } = await query.range(offset, offset + REPAIR_PAGE_SIZE);
  if (error) {
    throw new Error(`Failed to list Repairs: ${error.message}`);
  }

  const rows = data ?? [];
  return {
    items: rows.slice(0, REPAIR_PAGE_SIZE).map(mapRepairSummary),
    page,
    hasPrevious: page > 1,
    hasNext: rows.length > REPAIR_PAGE_SIZE,
  };
}

export async function getRepairRecord(
  supabase: SupabaseClient,
  providerId: string,
  repairId: string,
): Promise<RepairDetail | null> {
  const { data, error } = await supabase
    .from("repairs")
    .select(REPAIR_DETAIL_COLUMNS)
    .eq("provider_id", providerId)
    .eq("id", repairId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Repair: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  const [eventsResult, updatesResult] = await Promise.all([
    supabase
      .from("repair_status_events")
      .select("id, from_status, to_status, changed_by_user_id, created_at")
      .eq("repair_id", repairId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("repair_updates")
      .select("id, message, created_by_user_id, created_at")
      .eq("repair_id", repairId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
  ]);

  if (eventsResult.error) {
    throw new Error(
      `Failed to load Repair Status Events: ${eventsResult.error.message}`,
    );
  }
  if (updatesResult.error) {
    throw new Error(
      `Failed to load Customer Updates: ${updatesResult.error.message}`,
    );
  }

  return mapRepairDetail(
    data,
    (eventsResult.data ?? []).map(mapRepairStatusEvent),
    (updatesResult.data ?? []).map(mapCustomerUpdate),
  );
}

export async function getRepairCountRecords(
  supabase: SupabaseClient,
  providerId: string,
): Promise<RepairCounts> {
  const countStatuses = (statuses: RepairStatus[]) =>
    supabase
      .from("repairs")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .in("current_status", statuses);

  const [active, waiting, ready, completed] = await Promise.all([
    countStatuses(["IN_PROGRESS"]),
    countStatuses(["WAITING_FOR_PARTS", "AWAITING_APPROVAL"]),
    countStatuses(["READY"]),
    countStatuses(["COMPLETED"]),
  ]);

  for (const result of [active, waiting, ready, completed]) {
    if (result.error) {
      throw new Error(`Failed to count Repairs: ${result.error.message}`);
    }
  }

  return {
    active: active.count ?? 0,
    waiting: waiting.count ?? 0,
    ready: ready.count ?? 0,
    completed: completed.count ?? 0,
  };
}

export async function updateRepairRecord(
  supabase: SupabaseClient,
  providerId: string,
  repairId: string,
  input: UpdateRepairDetailsInput,
): Promise<RepairDetail | null> {
  const { data, error } = await supabase
    .from("repairs")
    .update({
      customer_name: input.customerName,
      customer_phone: input.customerPhone,
      customer_email: input.customerEmail || null,
      device_type: input.deviceType,
      brand: input.brand || null,
      model: input.model || null,
      serial_number: input.serialNumber || null,
      color_variant: input.colorVariant || null,
      device_specs: input.deviceSpecs || null,
      physical_condition: input.physicalCondition || null,
      accessories_received: input.accessoriesReceived || null,
      reported_problem: input.reportedProblem,
      initial_observation: input.initialObservation || null,
      diagnosis: input.diagnosis || null,
      internal_notes: input.internalNotes || null,
      service_mode: input.serviceMode || null,
      service_mode_details: input.serviceModeDetails || null,
    })
    .eq("provider_id", providerId)
    .eq("id", repairId)
    .select(REPAIR_DETAIL_COLUMNS)
    .maybeSingle();

  if (error) {
    throwRepairPersistenceError("Failed to update Repair", error.message);
  }
  if (!data) {
    return null;
  }

  const existing = await getRepairRecord(supabase, providerId, repairId);
  return existing;
}

export async function changeRepairStatusRecord(
  supabase: SupabaseClient,
  repairId: string,
  nextStatus: RepairStatus,
): Promise<void> {
  const { error } = await supabase.rpc("change_repair_status", {
    p_repair_id: repairId,
    p_next_status: nextStatus,
  });

  if (error) {
    throwRepairPersistenceError(
      "Failed to change Repair status",
      error.message,
    );
  }
}

export async function insertCustomerUpdateRecord(
  supabase: SupabaseClient,
  repairId: string,
  message: string,
): Promise<CustomerUpdate> {
  const { data, error } = await supabase
    .from("repair_updates")
    .insert({ repair_id: repairId, message })
    .select("id, message, created_by_user_id, created_at")
    .single();

  if (error) {
    throwRepairPersistenceError("Failed to add Customer Update", error.message);
  }

  return mapCustomerUpdate(data);
}

function mapRepairSummary(data: Record<string, unknown>): RepairSummary {
  return {
    id: data.id as string,
    ticketNumber: data.ticket_number as string,
    origin: data.origin as RepairSummary["origin"],
    customerName: data.customer_name as string,
    deviceType: data.device_type as string,
    brand: data.brand as string | null,
    model: data.model as string | null,
    reportedProblem: data.reported_problem as string,
    currentStatus: data.current_status as RepairStatus,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}

function mapRepairDetail(
  data: Record<string, unknown>,
  statusEvents: RepairStatusEvent[],
  customerUpdates: CustomerUpdate[],
): RepairDetail {
  return {
    ...mapRepairSummary(data),
    providerId: data.provider_id as string,
    repairRequestId: data.repair_request_id as string | null,
    trackingCode: data.tracking_code as string,
    customerPhone: data.customer_phone as string,
    customerEmail: data.customer_email as string | null,
    serialNumber: data.serial_number as string | null,
    colorVariant: data.color_variant as string | null,
    deviceSpecs: data.device_specs as string | null,
    physicalCondition: data.physical_condition as string | null,
    accessoriesReceived: data.accessories_received as string | null,
    initialObservation: data.initial_observation as string | null,
    diagnosis: data.diagnosis as string | null,
    internalNotes: data.internal_notes as string | null,
    serviceMode: data.service_mode as RepairDetail["serviceMode"],
    serviceModeDetails: data.service_mode_details as string | null,
    createdByUserId: data.created_by_user_id as string,
    completedAt: data.completed_at as string | null,
    statusEvents,
    customerUpdates,
  };
}

function mapRepairStatusEvent(
  data: Record<string, unknown>,
): RepairStatusEvent {
  return {
    id: data.id as string,
    fromStatus: data.from_status as RepairStatus | null,
    toStatus: data.to_status as RepairStatus,
    changedByUserId: data.changed_by_user_id as string,
    createdAt: data.created_at as string,
  };
}

function mapCustomerUpdate(data: Record<string, unknown>): CustomerUpdate {
  return {
    id: data.id as string,
    message: data.message as string,
    createdByUserId: data.created_by_user_id as string,
    createdAt: data.created_at as string,
  };
}
