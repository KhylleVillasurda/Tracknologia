import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  RepairRequestDetail,
  RepairRequestFilter,
  RepairRequestReceipt,
  RepairRequestSummary,
  SubmitRepairRequestInput,
} from "./types";
import { RepairRequestError } from "./types";

function throwRepairRequestPersistenceError(
  operation: string,
  message: string,
): never {
  if (message.includes("PROVIDER_UNAVAILABLE")) {
    throw new RepairRequestError(
      "This Provider is not available for new Repair Requests",
      "PROVIDER_UNAVAILABLE",
    );
  }

  if (message.includes("UNSUPPORTED_SERVICE_MODE")) {
    throw new RepairRequestError(
      "Selected Service Mode is no longer available",
      "UNSUPPORTED_SERVICE_MODE",
    );
  }

  if (
    message.includes("INVALID_REQUEST_INPUT") ||
    message.includes("check_repair_requests_")
  ) {
    throw new RepairRequestError(
      "Repair Request details are invalid",
      "INVALID_INPUT",
    );
  }

  if (message.includes("REQUEST_NOT_FOUND")) {
    throw new RepairRequestError(
      "Repair Request was not found",
      "REQUEST_NOT_FOUND",
    );
  }

  if (message.includes("REQUEST_ALREADY_PROCESSED")) {
    throw new RepairRequestError(
      "Repair Request has already been processed",
      "REQUEST_ALREADY_PROCESSED",
    );
  }

  throw new Error(`${operation}: ${message}`);
}

export async function submitRepairRequestRecord(
  supabase: SupabaseClient,
  providerSlug: string,
  input: SubmitRepairRequestInput,
): Promise<RepairRequestReceipt> {
  const { data, error } = await supabase.rpc("submit_repair_request", {
    p_provider_slug: providerSlug,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_customer_email: input.customerEmail || null,
    p_device_type: input.deviceType,
    p_brand: input.brand || null,
    p_model: input.model || null,
    p_serial_number: input.serialNumber || null,
    p_color_variant: input.colorVariant || null,
    p_device_specs: input.deviceSpecs || null,
    p_reported_problem: input.reportedProblem,
    p_problem_started_at: input.problemStartedAt || null,
    p_preceding_event: input.precedingEvent || null,
    p_troubleshooting_attempted: input.troubleshootingAttempted || null,
    p_additional_information: input.additionalInformation || null,
    p_preferred_service_mode: input.preferredServiceMode || null,
    p_service_mode_details: input.serviceModeDetails || null,
  });

  if (error) {
    throwRepairRequestPersistenceError(
      "Failed to submit Repair Request",
      error.message,
    );
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.reference_code) {
    throw new Error("Repair Request submission returned no receipt");
  }

  return {
    referenceCode: result.reference_code,
    submittedAt: result.submitted_at,
  };
}

export async function listRepairRequestRecords(
  supabase: SupabaseClient,
  providerId: string,
  filter: RepairRequestFilter,
): Promise<RepairRequestSummary[]> {
  let query = supabase
    .from("repair_requests")
    .select(
      "id, reference_code, customer_name, customer_phone, device_type, brand, model, reported_problem, status, submitted_at",
    )
    .eq("provider_id", providerId)
    .order("submitted_at", { ascending: false })
    .limit(100);

  if (filter.status) {
    query = query.eq("status", filter.status);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list Repair Requests: ${error.message}`);
  }

  return (data ?? []).map(mapRepairRequestSummary);
}

export async function getRepairRequestRecord(
  supabase: SupabaseClient,
  providerId: string,
  requestId: string,
): Promise<RepairRequestDetail | null> {
  const { data, error } = await supabase
    .from("repair_requests")
    .select("*")
    .eq("provider_id", providerId)
    .eq("id", requestId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Repair Request: ${error.message}`);
  }

  return data ? mapRepairRequestDetail(data) : null;
}

export async function declineRepairRequestRecord(
  supabase: SupabaseClient,
  requestId: string,
): Promise<RepairRequestDetail> {
  const { data, error } = await supabase.rpc("decline_repair_request", {
    p_request_id: requestId,
  });

  if (error) {
    throwRepairRequestPersistenceError(
      "Failed to decline Repair Request",
      error.message,
    );
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.id) {
    throw new Error("Repair Request decline returned no result");
  }

  return mapRepairRequestDetail(result);
}

function mapRepairRequestSummary(
  data: Record<string, unknown>,
): RepairRequestSummary {
  return {
    id: data.id as string,
    referenceCode: data.reference_code as string,
    customerName: data.customer_name as string,
    customerPhone: data.customer_phone as string,
    deviceType: data.device_type as string,
    brand: data.brand as string | null,
    model: data.model as string | null,
    reportedProblem: data.reported_problem as string,
    status: data.status as RepairRequestSummary["status"],
    submittedAt: data.submitted_at as string,
  };
}

function mapRepairRequestDetail(
  data: Record<string, unknown>,
): RepairRequestDetail {
  return {
    ...mapRepairRequestSummary(data),
    providerId: data.provider_id as string,
    customerEmail: data.customer_email as string | null,
    serialNumber: data.serial_number as string | null,
    colorVariant: data.color_variant as string | null,
    deviceSpecs: data.device_specs as string | null,
    problemStartedAt: data.problem_started_at as string | null,
    precedingEvent: data.preceding_event as string | null,
    troubleshootingAttempted: data.troubleshooting_attempted as string | null,
    additionalInformation: data.additional_information as string | null,
    preferredServiceMode:
      data.preferred_service_mode as RepairRequestDetail["preferredServiceMode"],
    serviceModeDetails: data.service_mode_details as string | null,
    acceptedAt: data.accepted_at as string | null,
    declinedAt: data.declined_at as string | null,
    acceptedByUserId: data.accepted_by_user_id as string | null,
    declinedByUserId: data.declined_by_user_id as string | null,
  };
}
