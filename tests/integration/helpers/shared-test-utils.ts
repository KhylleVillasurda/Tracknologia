import { expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";

import { assertSupabaseSuccess, uniqueName } from "./supabase-test-context";

export type ProviderType = "SHOP" | "INDEPENDENT";

export async function createProviderAs(
  client: SupabaseClient,
  params: {
    displayName?: string;
    providerType?: ProviderType | null;
    ownerDisplayName?: string | null;
    contactEmail?: string | null;
  } = {},
): Promise<{ providerId: string; membershipId: string; slug: string }> {
  const { data, error } = await client.rpc("create_provider_with_owner", {
    p_display_name: params.displayName ?? uniqueName("Provider"),
    p_provider_type: params.providerType ?? "SHOP",
    p_owner_display_name: params.ownerDisplayName ?? uniqueName("Owner"),
    p_owner_contact_phone: null,
    p_contact_email: params.contactEmail ?? null,
    p_contact_phone: null,
    p_public_address: null,
    p_service_area: null,
    p_supported_devices: [],
  });

  if (error) {
    throw new Error(`create_provider_with_owner failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("[DB fixture] create_provider_with_owner returned no row");
  }

  return {
    providerId: row.provider_id,
    membershipId: row.membership_id,
    slug: row.slug,
  };
}

export function opaqueActorKey(label: string = randomUUID()): string {
  return createHash("sha256").update(label).digest("hex");
}

export function expectRpcPermissionDenied(result: {
  error: { code?: string; message: string } | null;
}): void {
  expect(result.error).toMatchObject({ code: "42501" });
  expect(result.error?.message).toMatch(/permission denied for function/i);
}

export async function checkPublicOperationLimit(
  client: SupabaseClient,
  params: {
    operation: "tracking_lookup" | "repair_request_submit";
    actorKey: string;
    windowSeconds: number;
    maxRequests: number;
    cleanupLimit?: number;
  },
) {
  return client.rpc("check_public_operation_rate_limit", {
    p_operation: params.operation,
    p_actor_key: params.actorKey,
    p_window_seconds: params.windowSeconds,
    p_max_requests: params.maxRequests,
    p_cleanup_limit: params.cleanupLimit ?? 0,
  });
}

export function verifiedRepairInput(requestId: string) {
  return {
    p_request_id: requestId,
    p_customer_name: "Verified Customer Name",
    p_customer_phone: "+63 917 555 0199",
    p_customer_email: "verified@example.test",
    p_device_type: "Laptop",
    p_brand: "Verified Brand",
    p_model: "Verified Model",
    p_serial_number: "SERIAL-123",
    p_color_variant: "Black",
    p_device_specs: "16 GB RAM",
    p_physical_condition: "Minor scratches",
    p_accessories_received: "Charger",
    p_reported_problem: "Verified charging failure",
    p_initial_observation: "Charging port is loose",
    p_diagnosis: "Damaged charging port",
    p_internal_notes: "Private intake note",
    p_service_mode: "DROP_OFF",
    p_service_mode_details: "Front desk intake",
  };
}

export function directRepairInput(overrides: Record<string, unknown> = {}) {
  return {
    p_customer_name: "Direct Customer",
    p_customer_phone: "+63 917 555 0111",
    p_customer_email: "direct@example.test",
    p_device_type: "Laptop",
    p_brand: "Lenovo",
    p_model: "IdeaPad 3",
    p_serial_number: "DIRECT-SERIAL-123",
    p_color_variant: "Gray",
    p_device_specs: "16 GB RAM",
    p_physical_condition: "Light scratches",
    p_accessories_received: "Charger",
    p_reported_problem: "Battery does not charge",
    p_initial_observation: "Charging port is loose",
    p_diagnosis: "Damaged charging port",
    p_internal_notes: "Private direct-intake note",
    p_service_mode: "DROP_OFF",
    p_service_mode_details: "Front desk intake",
    ...overrides,
  };
}

export async function submitRepairRequestAs(
  client: SupabaseClient,
  providerSlug: string,
  overrides: Record<string, unknown> = {},
) {
  return client.rpc("submit_repair_request", {
    p_provider_slug: providerSlug,
    p_customer_name: "Customer Draft Name",
    p_customer_phone: "+63 917 555 0101",
    p_customer_email: "customer@example.test",
    p_device_type: "Laptop",
    p_brand: "Draft Brand",
    p_model: "Draft Model",
    p_serial_number: null,
    p_color_variant: null,
    p_device_specs: null,
    p_reported_problem: "Customer reports that the device will not charge.",
    p_problem_started_at: "Yesterday",
    p_preceding_event: null,
    p_troubleshooting_attempted: "Tried another charger",
    p_additional_information: null,
    p_preferred_service_mode: "DROP_OFF",
    p_service_mode_details: null,
    ...overrides,
  });
}

export async function readRepairRequestOutcome(
  adminClient: SupabaseClient,
  requestId: string,
) {
  const request = assertSupabaseSuccess(
    await adminClient
      .from("repair_requests")
      .select(
        "status, accepted_at, declined_at, accepted_by_user_id, declined_by_user_id",
      )
      .eq("id", requestId)
      .single(),
    "read durable Repair Request outcome",
  );
  if (!request.data) {
    throw new Error("Durable Repair Request outcome was not found");
  }

  const repairs = assertSupabaseSuccess(
    await adminClient
      .from("repairs")
      .select("id, current_status")
      .eq("repair_request_id", requestId)
      .order("created_at", { ascending: true }),
    "read durable Request-origin Repairs",
  );
  const repairRows = repairs.data ?? [];
  const repairIds = repairRows.map((repair) => repair.id);

  if (repairIds.length === 0) {
    return { request: request.data, repairs: repairRows, events: [] };
  }

  const events = assertSupabaseSuccess(
    await adminClient
      .from("repair_status_events")
      .select("repair_id, from_status, to_status")
      .in("repair_id", repairIds)
      .order("created_at", { ascending: true }),
    "read durable Request-origin Repair Status Events",
  );

  return {
    request: request.data,
    repairs: repairRows,
    events: events.data ?? [],
  };
}
