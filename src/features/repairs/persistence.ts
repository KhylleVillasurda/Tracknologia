import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { RequestOriginRepairInput, RepairResult } from "./types";
import { RepairError } from "./types";

function throwRepairPersistenceError(message: string): never {
  if (message.includes("REQUEST_NOT_FOUND")) {
    throw new RepairError("Repair Request was not found", "REQUEST_NOT_FOUND");
  }

  if (message.includes("REQUEST_ALREADY_PROCESSED")) {
    throw new RepairError(
      "Repair Request has already been processed",
      "REQUEST_ALREADY_PROCESSED",
    );
  }

  if (message.includes("UNSUPPORTED_SERVICE_MODE")) {
    throw new RepairError(
      "Selected Service Mode is not supported by this Provider",
      "UNSUPPORTED_SERVICE_MODE",
    );
  }

  if (
    message.includes("INVALID_REPAIR_INPUT") ||
    message.includes("check_repairs_")
  ) {
    throw new RepairError("Repair details are invalid", "INVALID_INPUT");
  }

  throw new Error(`Failed to create Repair from Request: ${message}`);
}

export async function createRepairFromRequestRecord(
  supabase: SupabaseClient,
  requestId: string,
  input: RequestOriginRepairInput,
): Promise<RepairResult> {
  const { data, error } = await supabase.rpc("create_repair_from_request", {
    p_request_id: requestId,
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
  });

  if (error) {
    throwRepairPersistenceError(error.message);
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.repair_id) {
    throw new Error("Request acceptance returned no Repair");
  }

  return {
    repairId: result.repair_id,
    ticketNumber: result.ticket_number,
    trackingCode: result.tracking_code,
    currentStatus: "IN_PROGRESS",
  };
}
