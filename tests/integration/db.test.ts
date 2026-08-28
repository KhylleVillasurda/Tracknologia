import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";

vi.mock("server-only", () => ({}));

import { hashInvitationToken } from "@/features/providers/persistence";
import { listRepairRequests } from "@/features/repair-requests";
import {
  getRepair,
  listRepairs,
  updateRepairDetails,
} from "@/features/repairs";
import {
  cleanupFixture,
  assertSupabaseMutation,
  assertSupabaseSuccess,
  createAdminClient,
  createAnonClient,
  createAuthenticatedClient,
  createTestUser,
  requireDbConfig,
  signInTestUser,
  uniqueEmail,
  uniqueName,
} from "./helpers/supabase-test-context";

type ProviderType = "SHOP" | "INDEPENDENT";

const password = "TestPassword123!";

function opaqueActorKey(label: string = randomUUID()): string {
  return createHash("sha256").update(label).digest("hex");
}

function expectRpcPermissionDenied(result: {
  error: { code?: string; message: string } | null;
}): void {
  expect(result.error).toMatchObject({ code: "42501" });
  expect(result.error?.message).toMatch(/permission denied for function/i);
}

async function checkPublicOperationLimit(
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

requireDbConfig();

async function createProviderAs(
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

async function createInvitationAs(
  client: SupabaseClient,
  email = uniqueEmail("staff"),
): Promise<{
  invitationId: string;
  email: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  reused: boolean;
}> {
  const tokenHash = hashInvitationToken(`inv_${randomUUID()}_${randomUUID()}`);
  const { data, error } = await client.rpc("create_staff_invitation", {
    p_email: email,
    p_token_hash: tokenHash,
  });

  if (error) {
    throw new Error(`create_staff_invitation failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("[DB fixture] create_staff_invitation returned no row");
  }

  return {
    invitationId: row.invitation_id,
    email: row.email,
    tokenHash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    reused: row.reused === true,
  };
}

async function acceptInvitationAs(
  client: SupabaseClient,
  tokenHash: string,
  displayName = uniqueName("Staff"),
) {
  return client.rpc("accept_staff_invitation", {
    p_token_hash: tokenHash,
    p_display_name: displayName,
    p_contact_phone: null,
  });
}

async function submitRepairRequestAs(
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

function verifiedRepairInput(requestId: string) {
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

function directRepairInput(overrides: Record<string, unknown> = {}) {
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

async function readRepairRequestOutcome(
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

describe("PostgreSQL Real Database, RPCs & RLS Integration Suite (AUTH-R28)", () => {
  let adminClient: SupabaseClient;
  let anonClient: SupabaseClient;
  // The application identity for public operations: after
  // 20260825120000_restrict_public_rpc_grants.sql, the anon role can no
  // longer execute the public operation functions; the app server uses the
  // service-role credential (src/lib/supabase/service.ts).
  let serviceClient: SupabaseClient;

  beforeAll(() => {
    adminClient = createAdminClient();
    anonClient = createAnonClient();
    serviceClient = createAdminClient();
  });

  it("denies direct anon execution of public operation functions", async () => {
    const lookup = await anonClient.rpc("lookup_public_repair", {
      p_tracking_code: "TRK-0123456789ABCDEF01234567",
    });
    expectRpcPermissionDenied(lookup);

    const observation = await anonClient.rpc(
      "record_successful_tracking_view",
      { p_tracking_code: "TRK-0123456789ABCDEF01234567" },
    );
    expectRpcPermissionDenied(observation);

    const submission = await submitRepairRequestAs(
      anonClient,
      "no-such-provider-slug",
    );
    expectRpcPermissionDenied(submission);

    const limiter = await checkPublicOperationLimit(anonClient, {
      operation: "tracking_lookup",
      actorKey: opaqueActorKey(),
      windowSeconds: 60,
      maxRequests: 1,
    });
    expectRpcPermissionDenied(limiter);
  });

  it("denies signed-in authenticated execution of public operation functions", async () => {
    const user = await createTestUser(
      adminClient,
      uniqueEmail("public-operation-denial"),
      password,
    );
    const auth = await signInTestUser(user.email, password);

    try {
      expectRpcPermissionDenied(
        await auth.client.rpc("lookup_public_repair", {
          p_tracking_code: "TRK-0123456789ABCDEF01234567",
        }),
      );
      expectRpcPermissionDenied(
        await auth.client.rpc("record_successful_tracking_view", {
          p_tracking_code: "TRK-0123456789ABCDEF01234567",
        }),
      );
      expectRpcPermissionDenied(
        await submitRepairRequestAs(auth.client, "no-such-provider-slug"),
      );
      expectRpcPermissionDenied(
        await checkPublicOperationLimit(auth.client, {
          operation: "tracking_lookup",
          actorKey: opaqueActorKey(),
          windowSeconds: 60,
          maxRequests: 1,
        }),
      );
    } finally {
      await cleanupFixture(adminClient, { userIds: [user.user.id] });
    }
  });

  it("atomically preserves an exact threshold across service clients and isolates operations", async () => {
    const secondServiceClient = createAdminClient();
    const rawIdentifier = `raw-client-${randomUUID()}`;
    const actorKey = opaqueActorKey(rawIdentifier);
    const attempts = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        checkPublicOperationLimit(
          index % 2 === 0 ? serviceClient : secondServiceClient,
          {
            operation: "tracking_lookup",
            actorKey,
            windowSeconds: 60,
            maxRequests: 5,
          },
        ),
      ),
    );
    const rows = attempts.map((attempt, index) => {
      const successful = assertSupabaseSuccess(
        attempt,
        `consume concurrent public-operation budget ${index}`,
      );
      return Array.isArray(successful.data)
        ? successful.data[0]
        : successful.data;
    });

    expect(rows.filter((row) => row?.allowed)).toHaveLength(5);
    expect(rows.filter((row) => !row?.allowed)).toHaveLength(7);
    expect(rows.map((row) => row?.request_count).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );

    const durable = assertSupabaseSuccess(
      await secondServiceClient
        .from("public_operation_rate_limits")
        .select("*")
        .eq("operation", "tracking_lookup")
        .eq("actor_key", actorKey)
        .single(),
      "read durable public-operation limit from a second client",
    );
    expect(durable.data).toMatchObject({
      operation: "tracking_lookup",
      actor_key: actorKey,
      request_count: 12,
    });
    expect(Object.keys(durable.data ?? {}).sort()).toEqual([
      "actor_key",
      "expires_at",
      "operation",
      "request_count",
      "window_started_at",
    ]);
    expect(JSON.stringify(durable.data)).not.toContain(rawIdentifier);

    const isolated = assertSupabaseSuccess(
      await checkPublicOperationLimit(secondServiceClient, {
        operation: "repair_request_submit",
        actorKey,
        windowSeconds: 60,
        maxRequests: 1,
      }),
      "consume isolated Repair Request budget",
    );
    const isolatedRow = Array.isArray(isolated.data)
      ? isolated.data[0]
      : isolated.data;
    expect(isolatedRow).toMatchObject({ allowed: true, request_count: 1 });
  });

  it("resets expired windows and bounds opportunistic cleanup", async () => {
    const expiredKeys = Array.from({ length: 4 }, () => opaqueActorKey());
    for (const actorKey of expiredKeys) {
      assertSupabaseSuccess(
        await checkPublicOperationLimit(serviceClient, {
          operation: "tracking_lookup",
          actorKey,
          windowSeconds: 1,
          maxRequests: 1,
        }),
        "create expiring public-operation window",
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 1_100));

    const cleanupTrigger = assertSupabaseSuccess(
      await checkPublicOperationLimit(serviceClient, {
        operation: "tracking_lookup",
        actorKey: opaqueActorKey(),
        windowSeconds: 60,
        maxRequests: 1,
        cleanupLimit: 2,
      }),
      "run bounded public-operation cleanup",
    );
    expect(
      Array.isArray(cleanupTrigger.data)
        ? cleanupTrigger.data[0]
        : cleanupTrigger.data,
    ).toMatchObject({ allowed: true, request_count: 1 });

    const retainedExpired = assertSupabaseSuccess(
      await serviceClient
        .from("public_operation_rate_limits")
        .select("actor_key")
        .in("actor_key", expiredKeys),
      "read public-operation cleanup remainder",
    );
    expect(retainedExpired.data).toHaveLength(2);

    const resetKey = retainedExpired.data?.[0]?.actor_key;
    if (!resetKey) {
      throw new Error("Expected one retained expired abuse-control row");
    }
    const reset = assertSupabaseSuccess(
      await checkPublicOperationLimit(serviceClient, {
        operation: "tracking_lookup",
        actorKey: resetKey,
        windowSeconds: 60,
        maxRequests: 1,
      }),
      "reset expired public-operation window",
    );
    const resetRow = Array.isArray(reset.data) ? reset.data[0] : reset.data;
    expect(resetRow).toMatchObject({ allowed: true, request_count: 1 });
  });

  it("allows service-role execution of public operation functions", async () => {
    // Well-formed but unknown Tracking Code: neutral empty result.
    const lookup = assertSupabaseSuccess(
      await serviceClient.rpc("lookup_public_repair", {
        p_tracking_code: "TRK-FFFFFFFFFFFFFFFFFFFFFFFF",
      }),
      "execute public Tracking lookup as service role",
    );
    const rows = Array.isArray(lookup.data) ? lookup.data : [];
    expect(rows).toEqual([]);

    assertSupabaseSuccess(
      await serviceClient.rpc("record_successful_tracking_view", {
        p_tracking_code: "TRK-FFFFFFFFFFFFFFFFFFFFFFFF",
      }),
      "execute public Tracking observation as service role",
    );
  });

  it("anon cannot SELECT raw providers, but can SELECT the public projection without private fields", async () => {
    const raw = await anonClient.from("providers").select("*");
    expect(raw.error).not.toBeNull();
    expect(raw.data).toBeNull();

    const projection = await anonClient
      .from("public_provider_profiles")
      .select("*")
      .limit(1);
    expect(projection.error).toBeNull();
    if (projection.data && projection.data.length > 0) {
      expect(projection.data[0]).not.toHaveProperty("contact_phone");
      expect(projection.data[0]).not.toHaveProperty("contact_email");
      expect(projection.data[0]).toHaveProperty("display_name");
      expect(projection.data[0]).toHaveProperty("accepting_requests");
      expect(projection.data[0]).toHaveProperty("service_modes");
    }
  });

  it("Provider A can access its own Provider but cannot read or mutate Provider B", async () => {
    const userA = await createTestUser(
      adminClient,
      uniqueEmail("owner-a"),
      password,
    );
    const userB = await createTestUser(
      adminClient,
      uniqueEmail("owner-b"),
      password,
    );
    const authA = await signInTestUser(userA.email, password);
    const authB = await signInTestUser(userB.email, password);
    const createdProviderIds: string[] = [];

    try {
      const providerA = await createProviderAs(authA.client, {
        displayName: uniqueName("Alpha Shop"),
      });
      const providerB = await createProviderAs(authB.client, {
        displayName: uniqueName("Beta Shop"),
      });
      createdProviderIds.push(providerA.providerId, providerB.providerId);

      const ownRead = await authA.client
        .from("providers")
        .select("id")
        .eq("id", providerA.providerId)
        .single();
      expect(ownRead.error).toBeNull();
      expect(ownRead.data?.id).toBe(providerA.providerId);

      const crossRead = await authA.client
        .from("providers")
        .select("id")
        .eq("id", providerB.providerId);
      expect(crossRead.error).toBeNull();
      expect(crossRead.data).toEqual([]);

      const attemptedName = uniqueName("Hijacked Shop");
      const crossUpdate = await authA.client
        .from("providers")
        .update({ display_name: attemptedName })
        .eq("id", providerB.providerId)
        .select("id");
      expect(crossUpdate.error).toBeNull();
      expect(crossUpdate.data).toEqual([]);

      const durable = assertSupabaseSuccess(
        await adminClient
          .from("providers")
          .select("display_name")
          .eq("id", providerB.providerId)
          .single(),
        "read Provider B after cross-provider update",
      );
      expect(durable.data?.display_name).not.toBe(attemptedName);
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [userA.user.id, userB.user.id],
      });
    }
  });

  it("Provider creation with operating configuration is atomic", async () => {
    const user = await createTestUser(
      adminClient,
      uniqueEmail("configured-owner"),
      password,
    );
    const auth = await signInTestUser(user.email, password);
    const failedDisplayName = uniqueName("Invalid Configured Provider");

    try {
      const failed = await auth.client.rpc(
        "create_provider_with_owner_and_modes",
        {
          p_display_name: failedDisplayName,
          p_provider_type: "SHOP",
          p_owner_display_name: uniqueName("Configured Owner"),
          p_owner_contact_phone: null,
          p_description: "Should roll back",
          p_contact_email: null,
          p_contact_phone: null,
          p_public_address: null,
          p_service_area: null,
          p_supported_devices: [],
          p_service_modes: [{ mode: "DROP_OFF" }, { mode: "DROP_OFF" }],
          p_accepting_requests: true,
        },
      );
      expect(failed.error).not.toBeNull();

      const providers = assertSupabaseSuccess(
        await adminClient
          .from("providers")
          .select("id")
          .eq("display_name", failedDisplayName),
        "read failed configured Provider",
      );
      const profiles = assertSupabaseSuccess(
        await adminClient
          .from("provider_user_profiles")
          .select("user_id")
          .eq("user_id", user.user.id),
        "read configured Provider profile after rollback",
      );
      const memberships = assertSupabaseSuccess(
        await adminClient
          .from("provider_memberships")
          .select("id")
          .eq("user_id", user.user.id),
        "read configured Provider membership after rollback",
      );

      expect(providers.data).toEqual([]);
      expect(profiles.data).toEqual([]);
      expect(memberships.data).toEqual([]);
    } finally {
      await cleanupFixture(adminClient, { userIds: [user.user.id] });
    }
  });

  it("Owner can update operating fields and Service Modes but not Provider identity", async () => {
    const user = await createTestUser(
      adminClient,
      uniqueEmail("settings-owner"),
      password,
    );
    const auth = await signInTestUser(user.email, password);
    const createdProviderIds: string[] = [];

    try {
      const created = assertSupabaseSuccess(
        await auth.client.rpc("create_provider_with_owner_and_modes", {
          p_display_name: uniqueName("Settings Provider"),
          p_provider_type: "SHOP",
          p_owner_display_name: uniqueName("Settings Owner"),
          p_owner_contact_phone: null,
          p_description: "Initial description",
          p_contact_email: null,
          p_contact_phone: null,
          p_public_address: null,
          p_service_area: "Cebu",
          p_supported_devices: ["Smartphones"],
          p_service_modes: [{ mode: "DROP_OFF" }],
          p_accepting_requests: true,
        }),
        "create Provider with operating configuration",
      );
      const createdRow = Array.isArray(created.data)
        ? created.data[0]
        : created.data;
      expect(createdRow).toBeTruthy();
      createdProviderIds.push(createdRow.provider_id);

      const identityUpdate = await auth.client
        .from("providers")
        .update({ provider_type: "INDEPENDENT" })
        .eq("id", createdRow.provider_id);
      expect(identityUpdate.error).not.toBeNull();

      const operatingUpdate = assertSupabaseMutation(
        await auth.client
          .from("providers")
          .update({
            description: "Updated description",
            accepting_requests: false,
          })
          .eq("id", createdRow.provider_id)
          .select("description, accepting_requests"),
        "update Provider operating profile",
      );
      expect(operatingUpdate.data?.[0]).toMatchObject({
        description: "Updated description",
        accepting_requests: false,
      });

      const modes = assertSupabaseSuccess(
        await auth.client.rpc("set_provider_service_modes", {
          p_service_modes: [
            { mode: "MEETUP" },
            { mode: "OTHER", details: "Courier collection" },
          ],
        }),
        "replace Provider Service Modes",
      );
      expect(modes.data).toHaveLength(2);

      const directModeInsert = await auth.client
        .from("provider_service_modes")
        .insert({ provider_id: createdRow.provider_id, mode: "DROP_OFF" });
      expect(directModeInsert.error).not.toBeNull();

      const durableIdentity = assertSupabaseSuccess(
        await adminClient
          .from("providers")
          .select("provider_type")
          .eq("id", createdRow.provider_id)
          .single(),
        "read Provider identity after denied update",
      );
      expect(durableIdentity.data?.provider_type).toBe("SHOP");
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [user.user.id],
      });
    }
  });

  it("Staff cannot change Provider settings or another profile but can update their own profile", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("settings-owner"),
      password,
    );
    const staff = await createTestUser(
      adminClient,
      uniqueEmail("settings-staff"),
      password,
    );
    const ownerAuth = await signInTestUser(owner.email, password);
    const staffAuth = await signInTestUser(staff.email, password);
    const ownerDisplayName = uniqueName("Settings Owner");
    const staffDisplayName = uniqueName("Settings Staff");
    const updatedStaffDisplayName = uniqueName("Updated Settings Staff");
    const attemptedOwnerDisplayName = uniqueName("Hijacked Settings Owner");
    const createdProviderIds: string[] = [];

    try {
      const provider = await createProviderAs(ownerAuth.client, {
        providerType: "SHOP",
        ownerDisplayName,
      });
      createdProviderIds.push(provider.providerId);

      const invitation = await createInvitationAs(
        ownerAuth.client,
        staff.email,
      );
      const accepted = await acceptInvitationAs(
        staffAuth.client,
        invitation.tokenHash,
        staffDisplayName,
      );
      expect(accepted.error).toBeNull();

      assertSupabaseSuccess(
        await ownerAuth.client.rpc("set_provider_service_modes", {
          p_service_modes: [{ mode: "DROP_OFF" }],
        }),
        "seed Provider Service Modes",
      );

      const providerUpdate = await staffAuth.client
        .from("providers")
        .update({ description: "Staff must not change this" })
        .eq("id", provider.providerId)
        .select("id");
      expect(providerUpdate.error).toBeNull();
      expect(providerUpdate.data).toEqual([]);

      const modeUpdate = await staffAuth.client.rpc(
        "set_provider_service_modes",
        {
          p_service_modes: [{ mode: "HOME_SERVICE" }],
        },
      );
      expect(modeUpdate.error).not.toBeNull();

      const ownProfileUpdate = assertSupabaseMutation(
        await staffAuth.client
          .from("provider_user_profiles")
          .update({
            display_name: updatedStaffDisplayName,
            contact_phone: "+63 900 000 0000",
          })
          .eq("user_id", staff.user.id)
          .select("user_id, display_name, contact_phone"),
        "update Staff own person profile",
      );
      expect(ownProfileUpdate.data?.[0]).toMatchObject({
        user_id: staff.user.id,
        display_name: updatedStaffDisplayName,
        contact_phone: "+63 900 000 0000",
      });

      const otherProfileUpdate = await staffAuth.client
        .from("provider_user_profiles")
        .update({ display_name: attemptedOwnerDisplayName })
        .eq("user_id", owner.user.id)
        .select("user_id");
      expect(otherProfileUpdate.error).toBeNull();
      expect(otherProfileUpdate.data).toEqual([]);

      const durableProvider = assertSupabaseSuccess(
        await adminClient
          .from("providers")
          .select("description")
          .eq("id", provider.providerId)
          .single(),
        "read Provider after Staff settings denial",
      );
      expect(durableProvider.data?.description).toBeNull();

      const durableModes = assertSupabaseSuccess(
        await adminClient
          .from("provider_service_modes")
          .select("mode")
          .eq("provider_id", provider.providerId),
        "read Service Modes after Staff replacement denial",
      );
      expect(durableModes.data?.map((row) => row.mode)).toEqual(["DROP_OFF"]);

      const durableProfiles = assertSupabaseSuccess(
        await adminClient
          .from("provider_user_profiles")
          .select("user_id, display_name, contact_phone")
          .in("user_id", [owner.user.id, staff.user.id]),
        "read person profiles after Staff profile updates",
      );
      const profilesByUserId = new Map(
        durableProfiles.data?.map((profile) => [profile.user_id, profile]),
      );
      expect(profilesByUserId.get(owner.user.id)?.display_name).toBe(
        ownerDisplayName,
      );
      expect(profilesByUserId.get(staff.user.id)).toMatchObject({
        display_name: updatedStaffDisplayName,
        contact_phone: "+63 900 000 0000",
      });
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [owner.user.id, staff.user.id],
      });
    }
  });

  it("failed standalone Service Mode replacement preserves the previous set", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("replacement-owner"),
      password,
    );
    const auth = await signInTestUser(owner.email, password);
    const createdProviderIds: string[] = [];

    try {
      const provider = await createProviderAs(auth.client);
      createdProviderIds.push(provider.providerId);

      assertSupabaseSuccess(
        await auth.client.rpc("set_provider_service_modes", {
          p_service_modes: [{ mode: "DROP_OFF" }],
        }),
        "seed replacement rollback Service Modes",
      );

      const invalidReplacement = await auth.client.rpc(
        "set_provider_service_modes",
        {
          p_service_modes: [{ mode: "MEETUP" }, { mode: "MEETUP" }],
        },
      );
      expect(invalidReplacement.error).not.toBeNull();

      const durableModes = assertSupabaseSuccess(
        await adminClient
          .from("provider_service_modes")
          .select("mode")
          .eq("provider_id", provider.providerId),
        "read Service Modes after failed standalone replacement",
      );
      expect(durableModes.data?.map((row) => row.mode)).toEqual(["DROP_OFF"]);
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [owner.user.id],
      });
    }
  });

  it("direct profile writes cannot bypass durable Provider input bounds", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("bounds-owner"),
      password,
    );
    const auth = await signInTestUser(owner.email, password);
    const createdProviderIds: string[] = [];

    try {
      const provider = await createProviderAs(auth.client);
      createdProviderIds.push(provider.providerId);

      const shortName = await auth.client
        .from("providers")
        .update({ display_name: "A" })
        .eq("id", provider.providerId)
        .select("id");
      expect(shortName.error).not.toBeNull();

      const longDescription = await auth.client
        .from("providers")
        .update({ description: "x".repeat(1001) })
        .eq("id", provider.providerId)
        .select("id");
      expect(longDescription.error).not.toBeNull();

      const tooManyDevices = await auth.client
        .from("providers")
        .update({
          supported_devices: Array.from(
            { length: 21 },
            (_, index) => `Device ${index}`,
          ),
        })
        .eq("id", provider.providerId)
        .select("id");
      expect(tooManyDevices.error).not.toBeNull();

      const longDeviceName = await auth.client
        .from("providers")
        .update({ supported_devices: ["x".repeat(81)] })
        .eq("id", provider.providerId)
        .select("id");
      expect(longDeviceName.error).not.toBeNull();

      const longAvatarUrl = await auth.client
        .from("provider_user_profiles")
        .update({ avatar_url: "x".repeat(2049) })
        .eq("user_id", owner.user.id)
        .select("user_id");
      expect(longAvatarUrl.error).not.toBeNull();

      const durableProvider = assertSupabaseSuccess(
        await adminClient
          .from("providers")
          .select("display_name, description, supported_devices")
          .eq("id", provider.providerId)
          .single(),
        "read Provider after bounded direct writes",
      );
      expect(durableProvider.data).toMatchObject({
        description: null,
        supported_devices: [],
      });
      expect(durableProvider.data?.display_name).not.toBe("A");

      const durableProfile = assertSupabaseSuccess(
        await adminClient
          .from("provider_user_profiles")
          .select("avatar_url")
          .eq("user_id", owner.user.id)
          .single(),
        "read person profile after bounded direct write",
      );
      expect(durableProfile.data?.avatar_url).toBeNull();
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [owner.user.id],
      });
    }
  });

  it("concurrent Service Mode replacements leave exactly one submitted set", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("mode-race-owner"),
      password,
    );
    const auth = await signInTestUser(owner.email, password);
    const clientA = createAuthenticatedClient(auth.session);
    const clientB = createAuthenticatedClient(auth.session);
    const submittedSetA = ["DROP_OFF", "MEETUP"].sort();
    const submittedSetB = ["HOME_SERVICE", "OTHER"].sort();
    const createdProviderIds: string[] = [];

    try {
      const provider = await createProviderAs(auth.client);
      createdProviderIds.push(provider.providerId);

      for (let attempt = 0; attempt < 5; attempt += 1) {
        assertSupabaseSuccess(
          await auth.client.rpc("set_provider_service_modes", {
            p_service_modes: [],
          }),
          `clear Service Modes before concurrent attempt ${attempt + 1}`,
        );

        const [replacementA, replacementB] = await Promise.all([
          clientA.rpc("set_provider_service_modes", {
            p_service_modes: submittedSetA.map((mode) => ({ mode })),
          }),
          clientB.rpc("set_provider_service_modes", {
            p_service_modes: submittedSetB.map((mode) => ({ mode })),
          }),
        ]);
        expect(replacementA.error).toBeNull();
        expect(replacementB.error).toBeNull();

        const durableModes = assertSupabaseSuccess(
          await adminClient
            .from("provider_service_modes")
            .select("mode")
            .eq("provider_id", provider.providerId),
          `read concurrent Service Modes after attempt ${attempt + 1}`,
        );
        const finalModes =
          durableModes.data?.map((row) => row.mode).sort() ?? [];
        expect([submittedSetA, submittedSetB]).toContainEqual(finalModes);
      }
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [owner.user.id],
      });
    }
  });

  it("authenticated users cannot direct-insert provider memberships or self-promote to OWNER", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("owner"),
      password,
    );
    const attacker = await createTestUser(
      adminClient,
      uniqueEmail("attacker"),
      password,
    );
    const ownerAuth = await signInTestUser(owner.email, password);
    const attackerAuth = await signInTestUser(attacker.email, password);
    const createdProviderIds: string[] = [];

    try {
      const provider = await createProviderAs(ownerAuth.client);
      createdProviderIds.push(provider.providerId);

      for (const role of ["STAFF", "OWNER"] as const) {
        const insert = await attackerAuth.client
          .from("provider_memberships")
          .insert({
            provider_id: provider.providerId,
            user_id: attacker.user.id,
            role,
          });
        expect(insert.error).not.toBeNull();
      }

      const durable = assertSupabaseSuccess(
        await adminClient
          .from("provider_memberships")
          .select("id")
          .eq("provider_id", provider.providerId)
          .eq("user_id", attacker.user.id),
        "read membership after direct-insert denial",
      );
      expect(durable.data).toEqual([]);
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [owner.user.id, attacker.user.id],
      });
    }
  });

  it("SHOP Owner can create Staff invitation; INDEPENDENT Owner cannot", async () => {
    const shopOwner = await createTestUser(
      adminClient,
      uniqueEmail("shop-owner"),
      password,
    );
    const independentOwner = await createTestUser(
      adminClient,
      uniqueEmail("independent-owner"),
      password,
    );
    const shopAuth = await signInTestUser(shopOwner.email, password);
    const independentAuth = await signInTestUser(
      independentOwner.email,
      password,
    );
    const createdProviderIds: string[] = [];

    try {
      const shop = await createProviderAs(shopAuth.client, {
        providerType: "SHOP",
      });
      const independent = await createProviderAs(independentAuth.client, {
        providerType: "INDEPENDENT",
      });
      createdProviderIds.push(shop.providerId, independent.providerId);

      const invite = await createInvitationAs(shopAuth.client);
      expect(invite.createdAt).toEqual(expect.any(String));
      expect(invite.expiresAt).toEqual(expect.any(String));
      expect(Number.isNaN(Date.parse(invite.createdAt))).toBe(false);
      expect(Number.isNaN(Date.parse(invite.expiresAt))).toBe(false);

      const row = assertSupabaseSuccess(
        await adminClient
          .from("provider_invitations")
          .select(
            "provider_id, email, role, token_hash, created_at, expires_at",
          )
          .eq("id", invite.invitationId)
          .single(),
        "read created invitation fixture",
      );
      expect(row.data).toMatchObject({
        provider_id: shop.providerId,
        email: invite.email,
        role: "STAFF",
        token_hash: invite.tokenHash,
        created_at: invite.createdAt,
        expires_at: invite.expiresAt,
      });
      expect(row.data?.token_hash).toMatch(/^[a-f0-9]{64}$/);

      const invitationDetails = assertSupabaseSuccess(
        await anonClient.rpc("get_invitation_details", {
          p_token_hash: invite.tokenHash,
        }),
        "read anonymous invitation projection",
      );
      const invitationDetail = Array.isArray(invitationDetails.data)
        ? invitationDetails.data[0]
        : invitationDetails.data;
      expect(invitationDetail).toMatchObject({
        provider_id: shop.providerId,
        email: invite.email,
      });
      expect(invitationDetail).not.toHaveProperty("contact_email");
      expect(invitationDetail).not.toHaveProperty("contact_phone");

      const deniedTokenHash = hashInvitationToken(
        `inv_${randomUUID()}_${randomUUID()}`,
      );
      const denied = await independentAuth.client.rpc(
        "create_staff_invitation",
        {
          p_email: uniqueEmail("denied-staff"),
          p_token_hash: deniedTokenHash,
        },
      );
      expect(denied.error).not.toBeNull();

      const deniedRows = assertSupabaseSuccess(
        await adminClient
          .from("provider_invitations")
          .select("id")
          .eq("token_hash", deniedTokenHash),
        "read denied invitation fixture",
      );
      expect(deniedRows.data).toEqual([]);
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [shopOwner.user.id, independentOwner.user.id],
      });
    }
  });

  it("Owner cannot direct-update invitation lifecycle fields, while narrow revoke succeeds", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("owner"),
      password,
    );
    const auth = await signInTestUser(owner.email, password);
    const createdProviderIds: string[] = [];

    try {
      const provider = await createProviderAs(auth.client);
      createdProviderIds.push(provider.providerId);
      const invite = await createInvitationAs(auth.client);

      const before = assertSupabaseSuccess(
        await adminClient
          .from("provider_invitations")
          .select("*")
          .eq("id", invite.invitationId)
          .single(),
        "read invitation before direct lifecycle update",
      );

      const direct = await auth.client
        .from("provider_invitations")
        .update({
          accepted_at: new Date().toISOString(),
          accepted_by_user_id: owner.user.id,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          token_hash: hashInvitationToken(`inv_${randomUUID()}`),
          provider_id: provider.providerId,
          revoked_at: new Date().toISOString(),
        })
        .eq("id", invite.invitationId)
        .select("id");
      expect(direct.error).not.toBeNull();

      const afterDirect = assertSupabaseSuccess(
        await adminClient
          .from("provider_invitations")
          .select("*")
          .eq("id", invite.invitationId)
          .single(),
        "read invitation after direct lifecycle denial",
      );
      expect(afterDirect.data).toMatchObject({
        accepted_at: before.data?.accepted_at,
        accepted_by_user_id: before.data?.accepted_by_user_id,
        expires_at: before.data?.expires_at,
        token_hash: before.data?.token_hash,
        provider_id: before.data?.provider_id,
        revoked_at: before.data?.revoked_at,
      });

      const revoked = await auth.client.rpc("revoke_staff_invitation", {
        p_invitation_id: invite.invitationId,
      });
      expect(revoked.error).toBeNull();
      expect(revoked.data).toBe(true);
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [owner.user.id],
      });
    }
  });

  it("reuses the existing active pending invitation for the same Shop and email", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("owner"),
      password,
    );
    const auth = await signInTestUser(owner.email, password);
    const createdProviderIds: string[] = [];

    try {
      const provider = await createProviderAs(auth.client);
      createdProviderIds.push(provider.providerId);

      const email = uniqueEmail("reuse");
      const first = await createInvitationAs(auth.client, email);
      const second = await createInvitationAs(auth.client, email);

      expect(first.reused).toBe(false);
      expect(second.reused).toBe(true);
      expect(second.invitationId).toBe(first.invitationId);

      const rows = assertSupabaseSuccess(
        await adminClient
          .from("provider_invitations")
          .select("id, token_hash, accepted_at, revoked_at, expires_at")
          .eq("provider_id", provider.providerId)
          .eq("email", email),
        "read invitation rows under reuse policy",
      );
      expect(rows.data).toHaveLength(1);
      expect(rows.data?.[0]?.token_hash).toBe(first.tokenHash);

      const details = assertSupabaseSuccess(
        await anonClient.rpc("get_invitation_details", {
          p_token_hash: first.tokenHash,
        }),
        "read original invitation projection after reuse",
      );
      const detail = Array.isArray(details.data)
        ? details.data[0]
        : details.data;
      expect(detail).toMatchObject({ email });
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [owner.user.id],
      });
    }
  });

  it("parallel duplicate invites for the same Shop and email yield exactly one active invitation", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("owner"),
      password,
    );
    const auth = await signInTestUser(owner.email, password);
    const createdProviderIds: string[] = [];

    try {
      const provider = await createProviderAs(auth.client);
      createdProviderIds.push(provider.providerId);

      const email = uniqueEmail("parallel");
      const [first, second] = await Promise.all([
        createInvitationAs(auth.client, email),
        createInvitationAs(auth.client, email),
      ]);

      expect(first.reused).not.toBe(second.reused);

      const active = assertSupabaseSuccess(
        await adminClient
          .from("provider_invitations")
          .select("id")
          .eq("provider_id", provider.providerId)
          .eq("email", email)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString()),
        "read active invitation rows after parallel create",
      );
      expect(active.data).toHaveLength(1);
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [owner.user.id],
      });
    }
  });

  it("keeps same-email invitations independent across different Shops", async () => {
    const ownerA = await createTestUser(
      adminClient,
      uniqueEmail("owner-a"),
      password,
    );
    const ownerB = await createTestUser(
      adminClient,
      uniqueEmail("owner-b"),
      password,
    );
    const authA = await signInTestUser(ownerA.email, password);
    const authB = await signInTestUser(ownerB.email, password);
    const createdProviderIds: string[] = [];

    try {
      const providerA = await createProviderAs(authA.client);
      const providerB = await createProviderAs(authB.client);
      createdProviderIds.push(providerA.providerId, providerB.providerId);

      const email = uniqueEmail("cross-shop");
      const inviteA = await createInvitationAs(authA.client, email);
      const inviteB = await createInvitationAs(authB.client, email);

      expect(inviteA.reused).toBe(false);
      expect(inviteB.reused).toBe(false);

      for (const providerId of [providerA.providerId, providerB.providerId]) {
        const active = assertSupabaseSuccess(
          await adminClient
            .from("provider_invitations")
            .select("id")
            .eq("provider_id", providerId)
            .eq("email", email)
            .is("accepted_at", null)
            .is("revoked_at", null)
            .gt("expires_at", new Date().toISOString()),
          "read active invitation per Shop",
        );
        expect(active.data).toHaveLength(1);
      }
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [ownerA.user.id, ownerB.user.id],
      });
    }
  });

  it("allows a fresh invitation once a previous one is expired, revoked, or accepted", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("owner"),
      password,
    );
    const staff = await createTestUser(
      adminClient,
      uniqueEmail("staff"),
      password,
    );
    const auth = await signInTestUser(owner.email, password);
    const staffAuth = await signInTestUser(staff.email, password);
    const createdProviderIds: string[] = [];
    const createdUserIds = [owner.user.id, staff.user.id];

    try {
      const provider = await createProviderAs(auth.client);
      createdProviderIds.push(provider.providerId);

      const expired = await createInvitationAs(auth.client);
      assertSupabaseMutation(
        await adminClient
          .from("provider_invitations")
          .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
          .eq("id", expired.invitationId)
          .select("id"),
        "expire invitation fixture",
      );
      const afterExpired = await createInvitationAs(auth.client, expired.email);
      expect(afterExpired.reused).toBe(false);
      expect(afterExpired.invitationId).not.toBe(expired.invitationId);

      const revoked = await createInvitationAs(auth.client);
      assertSupabaseSuccess(
        await auth.client.rpc("revoke_staff_invitation", {
          p_invitation_id: revoked.invitationId,
        }),
        "revoke invitation fixture",
      );
      const afterRevoked = await createInvitationAs(auth.client, revoked.email);
      expect(afterRevoked.reused).toBe(false);
      expect(afterRevoked.invitationId).not.toBe(revoked.invitationId);

      const accepted = await createInvitationAs(auth.client, staff.email);
      const accept = await acceptInvitationAs(
        staffAuth.client,
        accepted.tokenHash,
      );
      expect(accept.error).toBeNull();

      // An active Staff member is not eligible for a fresh invitation: the
      // create call must refuse instead of minting an unusable invitation.
      const memberReinvite = await auth.client.rpc("create_staff_invitation", {
        p_email: staff.email,
        p_token_hash: hashInvitationToken(
          `inv_${randomUUID()}_${randomUUID()}`,
        ),
      });
      expect(memberReinvite.error).not.toBeNull();
      expect(memberReinvite.error?.message).toMatch(
        /active provider membership/,
      );

      // After legitimate offboarding the same email becomes eligible again and
      // a new (non-reused) invitation can be created.
      const acceptedRow = Array.isArray(accept.data)
        ? accept.data[0]
        : accept.data;
      assertSupabaseSuccess(
        await auth.client.rpc("remove_staff_member", {
          p_membership_id: acceptedRow.membership_id,
        }),
        "offboard staff after acceptance",
      );
      const afterOffboarding = await createInvitationAs(
        auth.client,
        staff.email,
      );
      expect(afterOffboarding.reused).toBe(false);
      expect(afterOffboarding.invitationId).not.toBe(accepted.invitationId);
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: createdUserIds,
      });
    }
  });

  it("invitation acceptance rejects revoked, expired, consumed, wrong-email, and existing-member cases without partial state", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("owner"),
      password,
    );
    const staff = await createTestUser(
      adminClient,
      uniqueEmail("staff"),
      password,
    );
    const wrongEmailUser = await createTestUser(
      adminClient,
      uniqueEmail("wrong"),
      password,
    );
    const existingMember = await createTestUser(
      adminClient,
      uniqueEmail("existing"),
      password,
    );
    const ownerAuth = await signInTestUser(owner.email, password);
    const staffAuth = await signInTestUser(staff.email, password);
    const wrongAuth = await signInTestUser(wrongEmailUser.email, password);
    const existingAuth = await signInTestUser(existingMember.email, password);
    const createdProviderIds: string[] = [];
    const createdUserIds = [
      owner.user.id,
      staff.user.id,
      wrongEmailUser.user.id,
      existingMember.user.id,
    ];

    try {
      const provider = await createProviderAs(ownerAuth.client, {
        displayName: uniqueName("Invite Shop"),
      });
      const existingProvider = await createProviderAs(existingAuth.client, {
        displayName: uniqueName("Existing Shop"),
      });
      createdProviderIds.push(provider.providerId, existingProvider.providerId);

      const revoked = await createInvitationAs(ownerAuth.client, staff.email);
      assertSupabaseSuccess(
        await ownerAuth.client.rpc("revoke_staff_invitation", {
          p_invitation_id: revoked.invitationId,
        }),
        "revoke invitation fixture",
      );
      const revokedAccept = await acceptInvitationAs(
        staffAuth.client,
        revoked.tokenHash,
      );
      expect(revokedAccept.error).not.toBeNull();

      const expired = await createInvitationAs(ownerAuth.client, staff.email);
      assertSupabaseMutation(
        await adminClient
          .from("provider_invitations")
          .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
          .eq("id", expired.invitationId)
          .select("id"),
        "expire invitation fixture",
      );
      const expiredAccept = await acceptInvitationAs(
        staffAuth.client,
        expired.tokenHash,
      );
      expect(expiredAccept.error).not.toBeNull();

      const wrongEmail = await createInvitationAs(
        ownerAuth.client,
        staff.email,
      );
      const wrongEmailAccept = await acceptInvitationAs(
        wrongAuth.client,
        wrongEmail.tokenHash,
      );
      expect(wrongEmailAccept.error).not.toBeNull();

      assertSupabaseSuccess(
        await ownerAuth.client.rpc("revoke_staff_invitation", {
          p_invitation_id: wrongEmail.invitationId,
        }),
        "revoke wrong-email invitation fixture",
      );

      // Creating an invitation for an email that already belongs to an active
      // member is refused outright (the invite would be unusable), and a
      // legacy pending row for such a recipient is still rejected on accept.
      const memberCreate = await ownerAuth.client.rpc(
        "create_staff_invitation",
        {
          p_email: existingMember.email,
          p_token_hash: hashInvitationToken(
            `inv_${randomUUID()}_${randomUUID()}`,
          ),
        },
      );
      expect(memberCreate.error).not.toBeNull();
      expect(memberCreate.error?.message).toMatch(/active provider membership/);

      const existingInviteToken = hashInvitationToken(
        `inv_${randomUUID()}_${randomUUID()}`,
      );
      assertSupabaseMutation(
        await adminClient
          .from("provider_invitations")
          .insert({
            provider_id: provider.providerId,
            email: existingMember.email,
            role: "STAFF",
            token_hash: existingInviteToken,
            invited_by_user_id: owner.user.id,
          })
          .select("id"),
        "seed legacy pending invitation for existing member",
      );
      const existingRow = assertSupabaseSuccess(
        await adminClient
          .from("provider_invitations")
          .select("id")
          .eq("token_hash", existingInviteToken)
          .single(),
        "read seeded existing-member invitation",
      );
      const existing = { invitationId: existingRow.data!.id };
      const existingAccept = await acceptInvitationAs(
        existingAuth.client,
        existingInviteToken,
      );
      expect(existingAccept.error).not.toBeNull();
      expect(existingAccept.error?.message).toMatch(
        /active provider membership/,
      );

      const consumed = await createInvitationAs(ownerAuth.client, staff.email);
      const firstAccept = await acceptInvitationAs(
        staffAuth.client,
        consumed.tokenHash,
      );
      expect(firstAccept.error).toBeNull();
      const secondUser = await createTestUser(
        adminClient,
        uniqueEmail("second-staff"),
        password,
      );
      createdUserIds.push(secondUser.user.id);
      const secondAuth = await signInTestUser(secondUser.email, password);
      assertSupabaseMutation(
        await adminClient
          .from("provider_invitations")
          .update({ email: secondUser.email })
          .eq("id", consumed.invitationId)
          .select("id"),
        "change consumed invitation email fixture",
      );
      const secondAccept = await acceptInvitationAs(
        secondAuth.client,
        consumed.tokenHash,
      );
      expect(secondAccept.error).not.toBeNull();

      const rows = assertSupabaseSuccess(
        await adminClient
          .from("provider_memberships")
          .select("id, user_id")
          .eq("provider_id", provider.providerId),
        "read invitation acceptance memberships",
      );
      expect(
        rows.data?.filter((row) => row.user_id === staff.user.id),
      ).toHaveLength(1);
      expect(
        rows.data?.filter((row) => row.user_id === wrongEmailUser.user.id),
      ).toHaveLength(0);
      expect(
        rows.data?.filter((row) => row.user_id === existingMember.user.id),
      ).toHaveLength(0);
      expect(
        rows.data?.filter((row) => row.user_id === secondUser.user.id),
      ).toHaveLength(0);

      const states = assertSupabaseSuccess(
        await adminClient
          .from("provider_invitations")
          .select("id, accepted_at, accepted_by_user_id")
          .in("id", [
            revoked.invitationId,
            expired.invitationId,
            wrongEmail.invitationId,
            existing.invitationId,
          ]),
        "read invitation lifecycle states",
      );
      expect(
        states.data?.every(
          (row) => row.accepted_at === null && row.accepted_by_user_id === null,
        ),
      ).toBe(true);
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: createdUserIds,
      });
    }
  });

  it("accepting one invitation supersedes sibling active pending invitations for the same Shop and email", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("owner"),
      password,
    );
    const staff = await createTestUser(
      adminClient,
      uniqueEmail("staff"),
      password,
    );
    const ownerAuth = await signInTestUser(owner.email, password);
    const staffAuth = await signInTestUser(staff.email, password);
    const createdProviderIds: string[] = [];

    try {
      const provider = await createProviderAs(ownerAuth.client);
      createdProviderIds.push(provider.providerId);

      // Simulate legacy duplicate state: two active pending invitations for
      // the same Shop + email (direct inserts bypass the create RPC).
      const firstToken = hashInvitationToken(
        `inv_${randomUUID()}_${randomUUID()}`,
      );
      const siblingToken = hashInvitationToken(
        `inv_${randomUUID()}_${randomUUID()}`,
      );
      const seeds = [
        {
          id: randomUUID(),
          provider_id: provider.providerId,
          email: staff.email,
          role: "STAFF",
          token_hash: firstToken,
          invited_by_user_id: owner.user.id,
        },
        {
          id: randomUUID(),
          provider_id: provider.providerId,
          email: staff.email,
          role: "STAFF",
          token_hash: siblingToken,
          invited_by_user_id: owner.user.id,
        },
      ];
      assertSupabaseMutation(
        await adminClient
          .from("provider_invitations")
          .insert(seeds)
          .select("id"),
        "seed sibling pending invitations",
      );

      assertSupabaseSuccess(
        await acceptInvitationAs(staffAuth.client, firstToken),
        "staff accepts first sibling invitation",
      );

      const rows = assertSupabaseSuccess(
        await adminClient
          .from("provider_invitations")
          .select("id, accepted_at, revoked_at")
          .in(
            "id",
            seeds.map((seed) => seed.id),
          ),
        "read invitation states after settlement",
      );
      const byId = new Map(rows.data?.map((row) => [row.id, row]));
      expect(byId.get(seeds[0].id)?.accepted_at).not.toBeNull();
      expect(byId.get(seeds[0].id)?.revoked_at).toBeNull();
      expect(byId.get(seeds[1].id)?.accepted_at).toBeNull();
      expect(byId.get(seeds[1].id)?.revoked_at).not.toBeNull();

      // The superseded sibling link no longer resolves.
      const superseded = await anonClient.rpc("get_invitation_details", {
        p_token_hash: siblingToken,
      });
      expect(superseded.error ?? null).toBeNull();
      expect(Array.isArray(superseded.data) ? superseded.data.length : 0).toBe(
        0,
      );
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [owner.user.id, staff.user.id],
      });
    }
  });

  it("reconciles legacy duplicate active invitations to a single valid link per Shop and email", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("owner"),
      password,
    );
    const controlOwner = await createTestUser(
      adminClient,
      uniqueEmail("control-owner"),
      password,
    );
    const ownerAuth = await signInTestUser(owner.email, password);
    const controlAuth = await signInTestUser(controlOwner.email, password);
    const createdProviderIds: string[] = [];

    try {
      const provider = await createProviderAs(ownerAuth.client, {
        displayName: uniqueName("Legacy Shop"),
      });
      const otherProvider = await createProviderAs(controlAuth.client, {
        displayName: uniqueName("Control Shop"),
      });
      createdProviderIds.push(provider.providerId, otherProvider.providerId);

      const groupEmail = uniqueEmail("legacy-dup");
      const controlEmail = uniqueEmail("legacy-control");

      // Legacy duplicates: three simultaneously valid invitations for one
      // Shop + email (only the earliest must survive), plus a lone control
      // invitation on a different Shop that must be left untouched. created_at
      // is staged explicitly so the kept (earliest) row is deterministic.
      const earliest = new Date(Date.now() - 120_000).toISOString();
      const middle = new Date(Date.now() - 60_000).toISOString();
      const latest = new Date().toISOString();
      const seeds = [
        ...Array.from({ length: 3 }, (_, i) => ({
          id: randomUUID(),
          provider_id: provider.providerId,
          email: groupEmail,
          role: "STAFF",
          token_hash: hashInvitationToken(
            `inv_${randomUUID()}_${randomUUID()}`,
          ),
          invited_by_user_id: owner.user.id,
          created_at: i === 0 ? earliest : i === 1 ? middle : latest,
        })),
        {
          id: randomUUID(),
          provider_id: otherProvider.providerId,
          email: controlEmail,
          role: "STAFF",
          token_hash: hashInvitationToken(
            `inv_${randomUUID()}_${randomUUID()}`,
          ),
          invited_by_user_id: owner.user.id,
          created_at: middle,
        },
      ];
      assertSupabaseMutation(
        await adminClient
          .from("provider_invitations")
          .insert(seeds)
          .select("id"),
        "seed legacy invitation duplicates",
      );

      const keptToken = seeds[0].token_hash;
      const supersededTokens = [seeds[1].token_hash, seeds[2].token_hash];

      const reconcile = assertSupabaseSuccess(
        await adminClient.rpc("reconcile_staff_invitation_duplicates"),
        "run legacy duplicate reconciliation",
      );
      expect(reconcile.data).toBe(2);

      const rows = assertSupabaseSuccess(
        await adminClient
          .from("provider_invitations")
          .select("id, token_hash, accepted_at, revoked_at")
          .in(
            "id",
            seeds.map((seed) => seed.id),
          ),
        "read invitation states after reconciliation",
      );
      const active = rows.data?.filter(
        (row) => row.accepted_at === null && row.revoked_at === null,
      );
      expect(active).toHaveLength(2);
      expect(active?.map((row) => row.token_hash)).toEqual(
        expect.arrayContaining([keptToken, seeds[3].token_hash]),
      );

      // The kept (earliest) link still resolves after reconciliation.
      const kept = assertSupabaseSuccess(
        await anonClient.rpc("get_invitation_details", {
          p_token_hash: keptToken,
        }),
        "resolve the kept invitation link",
      );
      expect(Array.isArray(kept.data) ? kept.data.length : 0).toBeGreaterThan(
        0,
      );

      // Superseded duplicates no longer resolve.
      for (const token of supersededTokens) {
        const details = await anonClient.rpc("get_invitation_details", {
          p_token_hash: token,
        });
        expect(details.error ?? null).toBeNull();
        expect(Array.isArray(details.data) ? details.data.length : 0).toBe(0);
      }
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [owner.user.id, controlOwner.user.id],
      });
    }
  });

  it("reconcile keeps the earliest currently-valid invitation and leaves expired duplicates untouched", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("owner"),
      password,
    );
    const controlOwner = await createTestUser(
      adminClient,
      uniqueEmail("control-owner"),
      password,
    );
    const ownerAuth = await signInTestUser(owner.email, password);
    const controlAuth = await signInTestUser(controlOwner.email, password);
    const createdProviderIds: string[] = [];

    try {
      const provider = await createProviderAs(ownerAuth.client, {
        displayName: uniqueName("Expiry Shop"),
      });
      const otherProvider = await createProviderAs(controlAuth.client, {
        displayName: uniqueName("Expiry Control"),
      });
      createdProviderIds.push(provider.providerId, otherProvider.providerId);

      const groupEmail = uniqueEmail("expiry-dup");
      const controlEmail = uniqueEmail("expiry-control");

      const dayMs = 24 * 3600_000;
      const expiredCreatedAt = new Date(Date.now() - 10 * dayMs).toISOString();
      const expiredExpiresAt = new Date(Date.now() - 3 * dayMs).toISOString();
      const earlierCreatedAt = new Date(Date.now() - 2 * dayMs).toISOString();
      const laterCreatedAt = new Date(Date.now() - 1 * dayMs).toISOString();
      const futureExpiresAt = new Date(Date.now() + 5 * dayMs).toISOString();
      const futureExpiresAtLate = new Date(
        Date.now() + 6 * dayMs,
      ).toISOString();

      // One expired duplicate (created early) plus two currently-valid
      // duplicates for the same Shop + email, and a lone control invitation on
      // a different Shop. Reconcile must keep the EARLIEST currently-valid row
      // (not the expired early row), supersede only the later currently-valid
      // duplicate, and leave the expired row and the control untouched.
      const seeds = [
        {
          id: randomUUID(),
          provider_id: provider.providerId,
          email: groupEmail,
          role: "STAFF",
          token_hash: hashInvitationToken(
            `inv_${randomUUID()}_${randomUUID()}`,
          ),
          invited_by_user_id: owner.user.id,
          created_at: expiredCreatedAt,
          expires_at: expiredExpiresAt,
        },
        {
          id: randomUUID(),
          provider_id: provider.providerId,
          email: groupEmail,
          role: "STAFF",
          token_hash: hashInvitationToken(
            `inv_${randomUUID()}_${randomUUID()}`,
          ),
          invited_by_user_id: owner.user.id,
          created_at: earlierCreatedAt,
          expires_at: futureExpiresAt,
        },
        {
          id: randomUUID(),
          provider_id: provider.providerId,
          email: groupEmail,
          role: "STAFF",
          token_hash: hashInvitationToken(
            `inv_${randomUUID()}_${randomUUID()}`,
          ),
          invited_by_user_id: owner.user.id,
          created_at: laterCreatedAt,
          expires_at: futureExpiresAtLate,
        },
        {
          id: randomUUID(),
          provider_id: otherProvider.providerId,
          email: controlEmail,
          role: "STAFF",
          token_hash: hashInvitationToken(
            `inv_${randomUUID()}_${randomUUID()}`,
          ),
          invited_by_user_id: owner.user.id,
          created_at: earlierCreatedAt,
          expires_at: futureExpiresAt,
        },
      ];
      assertSupabaseMutation(
        await adminClient
          .from("provider_invitations")
          .insert(seeds)
          .select("id"),
        "seed mixed-expiry invitation duplicates",
      );

      const keptToken = seeds[1].token_hash;
      const supersededToken = seeds[2].token_hash;

      const reconcile = assertSupabaseSuccess(
        await adminClient.rpc("reconcile_staff_invitation_duplicates"),
        "run mixed-expiry legacy reconciliation",
      );
      expect(reconcile.data).toBe(1);

      const rows = assertSupabaseSuccess(
        await adminClient
          .from("provider_invitations")
          .select("id, token_hash, accepted_at, revoked_at")
          .in(
            "id",
            seeds.map((seed) => seed.id),
          ),
        "read invitation states after mixed-expiry reconciliation",
      );
      const byToken = new Map(rows.data?.map((row) => [row.token_hash, row]));

      // The earliest currently-valid invitation survives.
      expect(byToken.get(keptToken)?.accepted_at).toBeNull();
      expect(byToken.get(keptToken)?.revoked_at).toBeNull();
      // The later currently-valid duplicate is superseded.
      expect(byToken.get(supersededToken)?.revoked_at).not.toBeNull();
      // The expired duplicate is left untouched (it never resolves anyway).
      expect(byToken.get(seeds[0].token_hash)?.accepted_at).toBeNull();
      expect(byToken.get(seeds[0].token_hash)?.revoked_at).toBeNull();
      // The control invitation is untouched.
      expect(byToken.get(seeds[3].token_hash)?.revoked_at).toBeNull();

      // The survived link resolves.
      const kept = assertSupabaseSuccess(
        await anonClient.rpc("get_invitation_details", {
          p_token_hash: keptToken,
        }),
        "resolve the kept currently-valid invitation link",
      );
      expect(Array.isArray(kept.data) ? kept.data.length : 0).toBeGreaterThan(
        0,
      );

      // The superseded duplicate and the expired (untouched) link do not.
      for (const token of [supersededToken, seeds[0].token_hash]) {
        const details = await anonClient.rpc("get_invitation_details", {
          p_token_hash: token,
        });
        expect(details.error ?? null).toBeNull();
        expect(Array.isArray(details.data) ? details.data.length : 0).toBe(0);
      }
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [owner.user.id, controlOwner.user.id],
      });
    }
  });

  it("create vs register-and-accept race leaves exactly one membership and no unusable active invitation", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("owner"),
      password,
    );
    const ownerAuth = await signInTestUser(owner.email, password);
    const createdProviderIds: string[] = [];
    const createdUserIds = [owner.user.id];

    try {
      const provider = await createProviderAs(ownerAuth.client, {
        displayName: uniqueName("Race Shop"),
      });
      createdProviderIds.push(provider.providerId);

      // Each iteration starts from an eligible recipient (no membership): a
      // seeded active invitation already exists for the Shop+email, then an
      // Owner create races the recipient's own account registration + accept
      // of that same email (the "Auth User appears mid-create" scenario).
      // Whichever order commits inside the shared recipient-email lock, the
      // invariant must hold: exactly one membership AND zero active pending
      // invitations left for the Shop+email.
      const iterations = 6;
      for (let i = 0; i < iterations; i += 1) {
        const recipientEmail = uniqueEmail(`race-r${i}`);
        const seed = await createInvitationAs(ownerAuth.client, recipientEmail);

        const [createResult, account] = await Promise.all([
          ownerAuth.client.rpc("create_staff_invitation", {
            p_email: recipientEmail,
            p_token_hash: hashInvitationToken(
              `inv_${randomUUID()}_${randomUUID()}`,
            ),
          }),
          (async () => {
            const registered = await createTestUser(
              adminClient,
              recipientEmail,
              password,
            );
            createdUserIds.push(registered.user.id);
            const signedIn = await signInTestUser(recipientEmail, password);
            const accept = await acceptInvitationAs(
              signedIn.client,
              seed.tokenHash,
            );
            expect(accept.error).toBeNull();
            return registered;
          })(),
        ]);

        // create either reused the seeded invitation, minted a fresh one (the
        // acceptance settlement then supersedes it), or was refused because the
        // recipient had already become a member. Its own error is acceptable;
        // the resulting state is what has to be proven.
        const createRow = Array.isArray(createResult.data)
          ? createResult.data[0]
          : createResult.data;
        if (createResult.error === null && createRow) {
          if (createRow.reused === true) {
            expect(createRow.invitation_id).toBe(seed.invitationId);
          } else {
            const fresh = assertSupabaseSuccess(
              await adminClient
                .from("provider_invitations")
                .select("accepted_at, revoked_at")
                .eq("id", createRow.invitation_id)
                .single(),
              "read freshly created race invitation state",
            );
            expect(fresh.data?.revoked_at).not.toBeNull();
          }
        }

        const memberships = assertSupabaseSuccess(
          await adminClient
            .from("provider_memberships")
            .select("id")
            .eq("user_id", account.user.id),
          "read race membership count",
        );
        expect(memberships.data).toHaveLength(1);

        const pending = assertSupabaseSuccess(
          await adminClient
            .from("provider_invitations")
            .select("id")
            .eq("provider_id", provider.providerId)
            .eq("email", recipientEmail)
            .is("accepted_at", null)
            .is("revoked_at", null)
            .gt("expires_at", new Date().toISOString()),
          "read active pending invitations after race iteration",
        );
        expect(pending.data).toHaveLength(0);
      }
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: createdUserIds,
      });
    }
  });

  it("Owner onboarding racing a Staff-invite create leaves exactly one membership and no unusable active invitation", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("owner"),
      password,
    );
    const ownerAuth = await signInTestUser(owner.email, password);
    const createdProviderIds: string[] = [];
    const createdUserIds = [owner.user.id];

    try {
      const provider = await createProviderAs(ownerAuth.client, {
        displayName: uniqueName("Onboard Shop"),
      });
      createdProviderIds.push(provider.providerId);

      // Each iteration starts from an eligible recipient (no membership): a
      // Staff-invite create races the recipient's own account registration +
      // Provider onboarding for that same email (the "Auth User appears
      // mid-create" scenario). Whichever order commits inside the shared
      // recipient-email lock, the invariant must hold: exactly one membership
      // AND zero active pending invitations left for the recipient email.
      const iterations = 6;
      for (let i = 0; i < iterations; i += 1) {
        const recipientEmail = uniqueEmail(`onboard-race-r${i}`);

        const [createResult, registered] = await Promise.all([
          ownerAuth.client.rpc("create_staff_invitation", {
            p_email: recipientEmail,
            p_token_hash: hashInvitationToken(
              `inv_${randomUUID()}_${randomUUID()}`,
            ),
          }),
          (async () => {
            const account = await createTestUser(
              adminClient,
              recipientEmail,
              password,
            );
            createdUserIds.push(account.user.id);
            const signedIn = await signInTestUser(recipientEmail, password);
            const onboarded = await createProviderAs(signedIn.client, {
              displayName: uniqueName("Onboard"),
            });
            createdProviderIds.push(onboarded.providerId);
            return account;
          })(),
        ]);

        // create either minted a fresh invitation before onboarding committed
        // (onboarding's settlement must then supersede it) or was refused on
        // its eligibility recheck because onboarding had already established a
        // membership. Its own error is acceptable; the resulting state is what
        // has to be proven.
        const createRow = Array.isArray(createResult.data)
          ? createResult.data[0]
          : createResult.data;
        if (createResult.error === null && createRow) {
          const outcome = assertSupabaseSuccess(
            await adminClient
              .from("provider_invitations")
              .select("accepted_at, revoked_at")
              .eq("id", createRow.invitation_id)
              .single(),
            "read onboarding-race invitation state",
          );
          expect(outcome.data?.accepted_at).toBeNull();
          expect(outcome.data?.revoked_at).not.toBeNull();
        }

        const memberships = assertSupabaseSuccess(
          await adminClient
            .from("provider_memberships")
            .select("id")
            .eq("user_id", registered.user.id),
          "read onboarding-race membership count",
        );
        expect(memberships.data).toHaveLength(1);

        const pending = assertSupabaseSuccess(
          await adminClient
            .from("provider_invitations")
            .select("id")
            .eq("email", recipientEmail)
            .is("accepted_at", null)
            .is("revoked_at", null)
            .gt("expires_at", new Date().toISOString()),
          "read active pending invitations after onboarding-race iteration",
        );
        expect(pending.data).toHaveLength(0);
      }
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: createdUserIds,
      });
    }
  });

  it("two concurrent Staff invite accepts for one User create exactly one membership and consume one invitation", async () => {
    const ownerA = await createTestUser(
      adminClient,
      uniqueEmail("owner-a"),
      password,
    );
    const ownerB = await createTestUser(
      adminClient,
      uniqueEmail("owner-b"),
      password,
    );
    const staff = await createTestUser(
      adminClient,
      uniqueEmail("race-staff"),
      password,
    );
    const ownerAAuth = await signInTestUser(ownerA.email, password);
    const ownerBAuth = await signInTestUser(ownerB.email, password);
    const staffAuth = await signInTestUser(staff.email, password);
    const createdProviderIds: string[] = [];

    try {
      const providerA = await createProviderAs(ownerAAuth.client, {
        displayName: uniqueName("Race A"),
      });
      const providerB = await createProviderAs(ownerBAuth.client, {
        displayName: uniqueName("Race B"),
      });
      createdProviderIds.push(providerA.providerId, providerB.providerId);
      const inviteA = await createInvitationAs(ownerAAuth.client, staff.email);
      const inviteB = await createInvitationAs(ownerBAuth.client, staff.email);

      const results = await Promise.allSettled([
        acceptInvitationAs(staffAuth.client, inviteA.tokenHash),
        acceptInvitationAs(staffAuth.client, inviteB.tokenHash),
      ]);
      const fulfilled = results.filter(
        (result) => result.status === "fulfilled" && !result.value.error,
      );
      const rejected = results.filter(
        (result) =>
          result.status === "rejected" ||
          (result.status === "fulfilled" && result.value.error),
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const memberships = assertSupabaseSuccess(
        await adminClient
          .from("provider_memberships")
          .select("id")
          .eq("user_id", staff.user.id),
        "read concurrent acceptance memberships",
      );
      expect(memberships.data).toHaveLength(1);

      const invitations = assertSupabaseSuccess(
        await adminClient
          .from("provider_invitations")
          .select("id, accepted_at")
          .in("id", [inviteA.invitationId, inviteB.invitationId]),
        "read concurrent acceptance invitations",
      );
      expect(
        invitations.data?.filter((row) => row.accepted_at !== null),
      ).toHaveLength(1);
      expect(
        invitations.data?.filter((row) => row.accepted_at === null),
      ).toHaveLength(1);
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [ownerA.user.id, ownerB.user.id, staff.user.id],
      });
    }
  });

  it("Provider-create vs Staff-accept race creates exactly one membership and no orphan losing state", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("owner"),
      password,
    );
    const candidate = await createTestUser(
      adminClient,
      uniqueEmail("candidate"),
      password,
    );
    const ownerAuth = await signInTestUser(owner.email, password);
    const candidateAuth = await signInTestUser(candidate.email, password);
    const createdProviderIds: string[] = [];
    const candidateProviderName = uniqueName("Candidate Provider");

    try {
      const shop = await createProviderAs(ownerAuth.client, {
        displayName: uniqueName("Race Invite Shop"),
      });
      createdProviderIds.push(shop.providerId);
      const invite = await createInvitationAs(
        ownerAuth.client,
        candidate.email,
      );

      const results = await Promise.allSettled([
        createProviderAs(candidateAuth.client, {
          displayName: candidateProviderName,
          providerType: "INDEPENDENT",
          ownerDisplayName: uniqueName("Candidate Owner"),
        }),
        acceptInvitationAs(candidateAuth.client, invite.tokenHash),
      ]);
      const successes = results.filter(
        (result) =>
          result.status === "fulfilled" &&
          !("error" in result.value && result.value.error),
      );
      const failures = results.filter(
        (result) =>
          result.status === "rejected" ||
          (result.status === "fulfilled" &&
            "error" in result.value &&
            result.value.error),
      );
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);

      const memberships = assertSupabaseSuccess(
        await adminClient
          .from("provider_memberships")
          .select("provider_id")
          .eq("user_id", candidate.user.id),
        "read race outcome membership",
      );
      expect(memberships.data).toHaveLength(1);

      const candidateProviders = assertSupabaseSuccess(
        await adminClient
          .from("providers")
          .select("id")
          .eq("display_name", candidateProviderName),
        "read race outcome Provider",
      );
      if (
        memberships.data?.[0]?.provider_id !== candidateProviders.data?.[0]?.id
      ) {
        expect(candidateProviders.data).toEqual([]);
      }

      const invitation = assertSupabaseSuccess(
        await adminClient
          .from("provider_invitations")
          .select("accepted_at")
          .eq("id", invite.invitationId)
          .single(),
        "read race outcome invitation",
      );
      const membershipProviderId = memberships.data?.[0]?.provider_id;
      if (membershipProviderId === shop.providerId) {
        expect(invitation.data?.accepted_at).not.toBeNull();
      } else {
        expect(invitation.data?.accepted_at).toBeNull();
        if (membershipProviderId) {
          createdProviderIds.push(membershipProviderId);
        }
      }
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [owner.user.id, candidate.user.id],
      });
    }
  });

  it("Provider onboarding failures leave no Provider, profile, or OWNER membership", async () => {
    const user = await createTestUser(
      adminClient,
      uniqueEmail("atomic-owner"),
      password,
    );
    const auth = await signInTestUser(user.email, password);
    const displayName = uniqueName("Atomic Failure Provider");

    try {
      const failed = await auth.client.rpc("create_provider_with_owner", {
        p_display_name: displayName,
        p_provider_type: null,
        p_owner_display_name: uniqueName("Atomic Owner"),
        p_owner_contact_phone: null,
        p_contact_email: null,
        p_contact_phone: null,
        p_public_address: null,
        p_service_area: null,
        p_supported_devices: [],
      });
      expect(failed.error).not.toBeNull();

      const providers = assertSupabaseSuccess(
        await adminClient
          .from("providers")
          .select("id")
          .eq("display_name", displayName),
        "read failed onboarding Provider fixture",
      );
      const profiles = assertSupabaseSuccess(
        await adminClient
          .from("provider_user_profiles")
          .select("user_id")
          .eq("user_id", user.user.id),
        "read failed onboarding profile fixture",
      );
      const memberships = assertSupabaseSuccess(
        await adminClient
          .from("provider_memberships")
          .select("id")
          .eq("user_id", user.user.id),
        "read failed onboarding membership fixture",
      );
      expect(providers.data).toEqual([]);
      expect(profiles.data).toEqual([]);
      expect(memberships.data).toEqual([]);
    } finally {
      await cleanupFixture(adminClient, { userIds: [user.user.id] });
    }
  });

  it("Staff acceptance failure leaves no Staff membership, profile mutation, or consumed invitation", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("owner"),
      password,
    );
    const staff = await createTestUser(
      adminClient,
      uniqueEmail("atomic-staff"),
      password,
    );
    const ownerAuth = await signInTestUser(owner.email, password);
    const staffAuth = await signInTestUser(staff.email, password);
    const createdProviderIds: string[] = [];

    try {
      const shop = await createProviderAs(ownerAuth.client, {
        providerType: "SHOP",
      });
      createdProviderIds.push(shop.providerId);
      const invite = await createInvitationAs(ownerAuth.client, staff.email);
      assertSupabaseMutation(
        await adminClient
          .from("providers")
          .update({ provider_type: "INDEPENDENT" })
          .eq("id", shop.providerId)
          .select("id"),
        "change Provider type fixture",
      );

      const failed = await acceptInvitationAs(
        staffAuth.client,
        invite.tokenHash,
      );
      expect(failed.error).not.toBeNull();

      const memberships = assertSupabaseSuccess(
        await adminClient
          .from("provider_memberships")
          .select("id")
          .eq("user_id", staff.user.id),
        "read failed acceptance membership fixture",
      );
      const profiles = assertSupabaseSuccess(
        await adminClient
          .from("provider_user_profiles")
          .select("user_id")
          .eq("user_id", staff.user.id),
        "read failed acceptance profile fixture",
      );
      const invitation = assertSupabaseSuccess(
        await adminClient
          .from("provider_invitations")
          .select("accepted_at, accepted_by_user_id")
          .eq("id", invite.invitationId)
          .single(),
        "read failed acceptance invitation fixture",
      );
      expect(memberships.data).toEqual([]);
      expect(profiles.data).toEqual([]);
      expect(invitation.data).toMatchObject({
        accepted_at: null,
        accepted_by_user_id: null,
      });
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [owner.user.id, staff.user.id],
      });
    }
  });

  it("unauthenticated create_provider_with_owner and direct blank required names fail", async () => {
    const unauthenticated = await anonClient.rpc("create_provider_with_owner", {
      p_display_name: "Test Shop",
      p_provider_type: "SHOP",
      p_owner_display_name: "Owner Name",
      p_owner_contact_phone: null,
      p_contact_email: null,
      p_contact_phone: null,
      p_public_address: null,
      p_service_area: null,
      p_supported_devices: [],
    });
    expect(unauthenticated.error).not.toBeNull();

    const user = await createTestUser(
      adminClient,
      uniqueEmail("blank-owner"),
      password,
    );
    const auth = await signInTestUser(user.email, password);

    try {
      const blankOwner = await auth.client.rpc("create_provider_with_owner", {
        p_display_name: uniqueName("Blank Owner Shop"),
        p_provider_type: "SHOP",
        p_owner_display_name: " ",
        p_owner_contact_phone: null,
        p_contact_email: null,
        p_contact_phone: null,
        p_public_address: null,
        p_service_area: null,
        p_supported_devices: [],
      });
      expect(blankOwner.error).not.toBeNull();
      expect(blankOwner.error?.message).toMatch(
        /Owner display name cannot be blank/i,
      );
    } finally {
      await cleanupFixture(adminClient, { userIds: [user.user.id] });
    }
  });

  it("rejects duplicate Provider name under concurrent creation and preserves single durable Provider", async () => {
    const userA = await createTestUser(
      adminClient,
      uniqueEmail("slug-a"),
      password,
    );
    const userB = await createTestUser(
      adminClient,
      uniqueEmail("slug-b"),
      password,
    );
    const authA = await signInTestUser(userA.email, password);
    const authB = await signInTestUser(userB.email, password);
    const providerName = uniqueName("Strict Slug Shop");
    const createdProviderIds: string[] = [];

    try {
      const attempts = await Promise.allSettled([
        createProviderAs(authA.client, {
          displayName: providerName,
          ownerDisplayName: uniqueName("Owner A"),
        }),
        createProviderAs(authB.client, {
          displayName: providerName,
          ownerDisplayName: uniqueName("Owner B"),
        }),
      ]);

      const fulfilled = attempts.filter(
        (
          a,
        ): a is PromiseFulfilledResult<{
          providerId: string;
          membershipId: string;
          slug: string;
        }> => a.status === "fulfilled",
      );
      const rejected = attempts.filter(
        (a): a is PromiseRejectedResult => a.status === "rejected",
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason?.message).toMatch(
        /A provider with this name already exists\. Please choose a different name\./,
      );

      const winningProvider = fulfilled[0].value;
      createdProviderIds.push(winningProvider.providerId);

      const durable = assertSupabaseSuccess(
        await adminClient
          .from("providers")
          .select("id, slug, display_name")
          .eq("id", winningProvider.providerId)
          .single(),
        "read durable winning Provider",
      );
      expect(durable.data?.display_name).toBe(providerName);
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: createdProviderIds,
        userIds: [userA.user.id, userB.user.id],
      });
    }
  });

  it("public Repair Request submission is restricted to available Provider configuration", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("request-public"),
      password,
    );
    const auth = await signInTestUser(owner.email, password);
    const provider = await createProviderAs(auth.client, {
      displayName: uniqueName("Request Provider"),
    });

    try {
      assertSupabaseSuccess(
        await auth.client.rpc("set_provider_service_modes", {
          p_service_modes: [{ mode: "DROP_OFF", details: "Front desk" }],
        }),
        "configure Request Provider Service Modes",
      );

      const submitted = assertSupabaseSuccess(
        await submitRepairRequestAs(serviceClient, provider.slug),
        "submit public Repair Request",
      );
      const receipt = Array.isArray(submitted.data)
        ? submitted.data[0]
        : submitted.data;
      expect(receipt.reference_code).toMatch(/^REQ-[A-F0-9]{16}$/);

      const durable = assertSupabaseSuccess(
        await adminClient
          .from("repair_requests")
          .select("provider_id, reference_code, status, preferred_service_mode")
          .eq("reference_code", receipt.reference_code)
          .single(),
        "read submitted Repair Request",
      );
      expect(durable.data).toMatchObject({
        provider_id: provider.providerId,
        status: "SUBMITTED",
        preferred_service_mode: "DROP_OFF",
      });

      const anonRead = await anonClient.from("repair_requests").select("id");
      expect(anonRead.error).not.toBeNull();

      const anonInsert = await anonClient.from("repair_requests").insert({
        provider_id: provider.providerId,
        reference_code: "REQ-0000000000000000",
        customer_name: "Bypass Customer",
        customer_phone: "09170000000",
        device_type: "Phone",
        reported_problem: "Attempt direct public insert",
      });
      expect(anonInsert.error).not.toBeNull();

      const unsupported = await submitRepairRequestAs(
        serviceClient,
        provider.slug,
        { p_preferred_service_mode: "HOME_SERVICE" },
      );
      expect(unsupported.error?.message).toMatch(/UNSUPPORTED_SERVICE_MODE/);

      assertSupabaseMutation(
        await auth.client
          .from("providers")
          .update({ accepting_requests: false })
          .eq("id", provider.providerId)
          .select("id"),
        "disable Provider Repair Requests",
      );

      const unavailable = await submitRepairRequestAs(
        serviceClient,
        provider.slug,
      );
      expect(unavailable.error?.message).toMatch(/PROVIDER_UNAVAILABLE/);
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: [provider.providerId],
        userIds: [owner.user.id],
      });
    }
  });

  it("Provider Request pagination reaches every row with stable tenant-scoped ordering", async () => {
    const ownerA = await createTestUser(
      adminClient,
      uniqueEmail("request-pages-a"),
      password,
    );
    const ownerB = await createTestUser(
      adminClient,
      uniqueEmail("request-pages-b"),
      password,
    );
    const authA = await signInTestUser(ownerA.email, password);
    const authB = await signInTestUser(ownerB.email, password);
    const providerA = await createProviderAs(authA.client);
    const providerB = await createProviderAs(authB.client);

    try {
      await Promise.all([
        authA.client
          .rpc("set_provider_service_modes", {
            p_service_modes: [{ mode: "DROP_OFF" }],
          })
          .then((result) =>
            assertSupabaseSuccess(
              result,
              "configure paginated Provider A Service Modes",
            ),
          ),
        authB.client
          .rpc("set_provider_service_modes", {
            p_service_modes: [{ mode: "DROP_OFF" }],
          })
          .then((result) =>
            assertSupabaseSuccess(
              result,
              "configure paginated Provider B Service Modes",
            ),
          ),
      ]);

      const submissions = await Promise.all(
        Array.from({ length: 60 }, (_, index) =>
          submitRepairRequestAs(serviceClient, providerA.slug, {
            p_customer_name: `Paginated Customer ${index}`,
          }),
        ),
      );
      submissions.forEach((submission, index) =>
        assertSupabaseSuccess(
          submission,
          `submit paginated Provider A Request ${index + 1}`,
        ),
      );

      const providerBSubmission = assertSupabaseSuccess(
        await submitRepairRequestAs(serviceClient, providerB.slug),
        "submit isolated Provider B Request",
      );
      const providerBReceipt = Array.isArray(providerBSubmission.data)
        ? providerBSubmission.data[0]
        : providerBSubmission.data;
      const providerBRequest = assertSupabaseSuccess(
        await adminClient
          .from("repair_requests")
          .select("id")
          .eq("reference_code", providerBReceipt.reference_code)
          .single(),
        "resolve isolated Provider B Request",
      );
      if (!providerBRequest.data) {
        throw new Error("Isolated Provider B Request was not created");
      }

      const [page1, page2, page3, page4, submittedPage2] = await Promise.all([
        listRepairRequests({ page: 1 }, authA.client),
        listRepairRequests({ page: 2 }, authA.client),
        listRepairRequests({ page: 3 }, authA.client),
        listRepairRequests({ page: 4 }, authA.client),
        listRepairRequests({ status: "SUBMITTED", page: 2 }, authA.client),
      ]);

      expect(page1.items).toHaveLength(25);
      expect(page1).toMatchObject({
        page: 1,
        hasPrevious: false,
        hasNext: true,
      });
      expect(page2.items).toHaveLength(25);
      expect(page2).toMatchObject({
        page: 2,
        hasPrevious: true,
        hasNext: true,
      });
      expect(page3.items).toHaveLength(10);
      expect(page3).toMatchObject({
        page: 3,
        hasPrevious: true,
        hasNext: false,
      });
      expect(page4.items).toHaveLength(0);
      expect(page4).toMatchObject({
        page: 4,
        hasPrevious: true,
        hasNext: false,
      });
      expect(submittedPage2.items.map((request) => request.id)).toEqual(
        page2.items.map((request) => request.id),
      );

      const allRequests = [...page1.items, ...page2.items, ...page3.items];
      expect(allRequests).toHaveLength(60);
      expect(new Set(allRequests.map((request) => request.id)).size).toBe(60);
      expect(allRequests.map((request) => request.id)).not.toContain(
        providerBRequest.data.id,
      );
      expect(allRequests.map((request) => request.id)).toEqual(
        [...allRequests]
          .sort(
            (left, right) =>
              right.submittedAt.localeCompare(left.submittedAt) ||
              right.id.localeCompare(left.id),
          )
          .map((request) => request.id),
      );

      const providerBPage = await listRepairRequests({}, authB.client);
      expect(providerBPage.items.map((request) => request.id)).toEqual([
        providerBRequest.data.id,
      ]);
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: [providerA.providerId, providerB.providerId],
        userIds: [ownerA.user.id, ownerB.user.id],
      });
    }
  }, 30_000);

  it("Provider isolation denies cross-Provider decisions and decline creates no Repair", async () => {
    const ownerA = await createTestUser(
      adminClient,
      uniqueEmail("request-owner-a"),
      password,
    );
    const ownerB = await createTestUser(
      adminClient,
      uniqueEmail("request-owner-b"),
      password,
    );
    const authA = await signInTestUser(ownerA.email, password);
    const authB = await signInTestUser(ownerB.email, password);
    const providerA = await createProviderAs(authA.client);
    const providerB = await createProviderAs(authB.client);

    try {
      assertSupabaseSuccess(
        await authA.client.rpc("set_provider_service_modes", {
          p_service_modes: [{ mode: "DROP_OFF" }],
        }),
        "configure Provider A Service Modes",
      );
      const submitted = assertSupabaseSuccess(
        await submitRepairRequestAs(serviceClient, providerA.slug),
        "submit Provider A Repair Request",
      );
      const receipt = Array.isArray(submitted.data)
        ? submitted.data[0]
        : submitted.data;
      const request = assertSupabaseSuccess(
        await adminClient
          .from("repair_requests")
          .select("id")
          .eq("reference_code", receipt.reference_code)
          .single(),
        "resolve Provider A Repair Request",
      );
      if (!request.data) {
        throw new Error("Provider A Repair Request was not created");
      }
      const requestId = request.data.id;

      const ownRows = assertSupabaseSuccess(
        await authA.client.from("repair_requests").select("id"),
        "Provider A lists own Requests",
      );
      const otherRows = assertSupabaseSuccess(
        await authB.client.from("repair_requests").select("id"),
        "Provider B lists Requests",
      );
      expect(ownRows.data?.map((row) => row.id)).toContain(requestId);
      expect(otherRows.data?.map((row) => row.id)).not.toContain(requestId);

      const directDecision = await authA.client
        .from("repair_requests")
        .update({ status: "DECLINED" })
        .eq("id", requestId);
      expect(directDecision.error).not.toBeNull();

      const crossTenantDecline = await authB.client.rpc(
        "decline_repair_request",
        { p_request_id: requestId },
      );
      expect(crossTenantDecline.error?.message).toMatch(/REQUEST_NOT_FOUND/);

      const crossTenantAcceptance = await authB.client.rpc(
        "create_repair_from_request",
        verifiedRepairInput(requestId),
      );
      expect(crossTenantAcceptance.error?.message).toMatch(/REQUEST_NOT_FOUND/);

      const stateAfterCrossTenantAttempts = await readRepairRequestOutcome(
        adminClient,
        requestId,
      );
      expect(stateAfterCrossTenantAttempts.request).toMatchObject({
        status: "SUBMITTED",
        accepted_at: null,
        declined_at: null,
        accepted_by_user_id: null,
        declined_by_user_id: null,
      });
      expect(stateAfterCrossTenantAttempts.repairs).toHaveLength(0);
      expect(stateAfterCrossTenantAttempts.events).toHaveLength(0);

      const declined = assertSupabaseSuccess(
        await authA.client.rpc("decline_repair_request", {
          p_request_id: requestId,
        }),
        "decline own Repair Request",
      );
      expect(declined.data?.[0]?.status).toBe("DECLINED");

      const repairs = assertSupabaseSuccess(
        await adminClient
          .from("repairs")
          .select("id")
          .eq("repair_request_id", requestId),
        "verify decline created no Repair",
      );
      expect(repairs.data).toHaveLength(0);

      const repeatedDecline = await authA.client.rpc("decline_repair_request", {
        p_request_id: requestId,
      });
      expect(repeatedDecline.error?.message).toMatch(
        /REQUEST_ALREADY_PROCESSED/,
      );

      const acceptanceAfterDecline = await authA.client.rpc(
        "create_repair_from_request",
        verifiedRepairInput(requestId),
      );
      expect(acceptanceAfterDecline.error?.message).toMatch(
        /REQUEST_ALREADY_PROCESSED/,
      );

      const declinedOutcome = await readRepairRequestOutcome(
        adminClient,
        requestId,
      );
      expect(declinedOutcome.request.status).toBe("DECLINED");
      expect(declinedOutcome.request.accepted_at).toBeNull();
      expect(declinedOutcome.request.declined_at).toBeTruthy();
      expect(declinedOutcome.repairs).toHaveLength(0);
      expect(declinedOutcome.events).toHaveLength(0);
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: [providerA.providerId, providerB.providerId],
        userIds: [ownerA.user.id, ownerB.user.id],
      });
    }
  });

  it("concurrent acceptance and decline serialize to one durable terminal outcome", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("request-terminal-race"),
      password,
    );
    const auth = await signInTestUser(owner.email, password);
    const provider = await createProviderAs(auth.client);

    try {
      assertSupabaseSuccess(
        await auth.client.rpc("set_provider_service_modes", {
          p_service_modes: [{ mode: "DROP_OFF" }],
        }),
        "configure terminal race Service Modes",
      );
      const submitted = assertSupabaseSuccess(
        await submitRepairRequestAs(serviceClient, provider.slug),
        "submit Request for terminal race",
      );
      const receipt = Array.isArray(submitted.data)
        ? submitted.data[0]
        : submitted.data;
      const request = assertSupabaseSuccess(
        await adminClient
          .from("repair_requests")
          .select("id")
          .eq("reference_code", receipt.reference_code)
          .single(),
        "resolve Request for terminal race",
      );
      if (!request.data) {
        throw new Error("Repair Request for terminal race was not created");
      }
      const requestId = request.data.id;

      const attempts = await Promise.all([
        auth.client
          .rpc("create_repair_from_request", verifiedRepairInput(requestId))
          .then((result) => ({ operation: "accept" as const, result })),
        auth.client
          .rpc("decline_repair_request", { p_request_id: requestId })
          .then((result) => ({ operation: "decline" as const, result })),
      ]);
      const successful = attempts.filter(({ result }) => !result.error);
      const rejected = attempts.filter(({ result }) => result.error);
      expect(successful).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.result.error?.message).toMatch(
        /REQUEST_ALREADY_PROCESSED/,
      );

      const outcome = await readRepairRequestOutcome(adminClient, requestId);
      if (outcome.request.status === "ACCEPTED") {
        expect(successful[0]?.operation).toBe("accept");
        expect(outcome.request.accepted_at).toBeTruthy();
        expect(outcome.request.declined_at).toBeNull();
        expect(outcome.repairs).toHaveLength(1);
        expect(outcome.repairs[0]?.current_status).toBe("IN_PROGRESS");
        expect(outcome.events).toEqual([
          {
            repair_id: outcome.repairs[0]?.id,
            from_status: null,
            to_status: "IN_PROGRESS",
          },
        ]);
      } else {
        expect(outcome.request.status).toBe("DECLINED");
        expect(successful[0]?.operation).toBe("decline");
        expect(outcome.request.accepted_at).toBeNull();
        expect(outcome.request.declined_at).toBeTruthy();
        expect(outcome.repairs).toHaveLength(0);
        expect(outcome.events).toHaveLength(0);
      }
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: [provider.providerId],
        userIds: [owner.user.id],
      });
    }
  });

  it("concurrent acceptance creates one corrected IN_PROGRESS Repair and initial event", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("request-accept"),
      password,
    );
    const auth = await signInTestUser(owner.email, password);
    const provider = await createProviderAs(auth.client);

    try {
      assertSupabaseSuccess(
        await auth.client.rpc("set_provider_service_modes", {
          p_service_modes: [{ mode: "DROP_OFF" }],
        }),
        "configure acceptance Service Modes",
      );
      const submitted = assertSupabaseSuccess(
        await submitRepairRequestAs(serviceClient, provider.slug),
        "submit Request for acceptance",
      );
      const receipt = Array.isArray(submitted.data)
        ? submitted.data[0]
        : submitted.data;
      const request = assertSupabaseSuccess(
        await adminClient
          .from("repair_requests")
          .select("id")
          .eq("reference_code", receipt.reference_code)
          .single(),
        "resolve Request for acceptance",
      );
      if (!request.data) {
        throw new Error("Repair Request for acceptance was not created");
      }
      const requestId = request.data.id;

      const directRepairInsert = await auth.client
        .from("repairs")
        .insert({ provider_id: provider.providerId });
      expect(directRepairInsert.error).not.toBeNull();

      const attempts = await Promise.all([
        auth.client.rpc(
          "create_repair_from_request",
          verifiedRepairInput(requestId),
        ),
        auth.client.rpc(
          "create_repair_from_request",
          verifiedRepairInput(requestId),
        ),
      ]);
      const successful = attempts.filter((attempt) => !attempt.error);
      const rejected = attempts.filter((attempt) => attempt.error);
      expect(successful).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.error?.message).toMatch(/REQUEST_ALREADY_PROCESSED/);

      const durableRequest = assertSupabaseSuccess(
        await adminClient
          .from("repair_requests")
          .select("status, accepted_at, accepted_by_user_id")
          .eq("id", requestId)
          .single(),
        "read accepted Request",
      );
      if (!durableRequest.data) {
        throw new Error("Accepted Repair Request was not persisted");
      }
      expect(durableRequest.data.status).toBe("ACCEPTED");
      expect(durableRequest.data.accepted_at).toBeTruthy();
      expect(durableRequest.data.accepted_by_user_id).toBe(owner.user.id);

      const repair = assertSupabaseSuccess(
        await adminClient
          .from("repairs")
          .select(
            "id, origin, current_status, customer_name, customer_phone, brand, model, diagnosis, internal_notes, ticket_number, tracking_code",
          )
          .eq("repair_request_id", requestId)
          .single(),
        "read accepted Request Repair",
      );
      if (!repair.data) {
        throw new Error("Accepted Repair was not created");
      }
      expect(repair.data).toMatchObject({
        origin: "CUSTOMER_REQUEST",
        current_status: "IN_PROGRESS",
        customer_name: "Verified Customer Name",
        customer_phone: "+63 917 555 0199",
        brand: "Verified Brand",
        model: "Verified Model",
        diagnosis: "Damaged charging port",
        internal_notes: "Private intake note",
      });
      expect(repair.data.ticket_number).toMatch(/^TN-[0-9]{4}-[A-F0-9]{10}$/);
      expect(repair.data.tracking_code).toMatch(/^TRK-[A-F0-9]{24}$/);

      const events = assertSupabaseSuccess(
        await adminClient
          .from("repair_status_events")
          .select("from_status, to_status, changed_by_user_id")
          .eq("repair_id", repair.data.id),
        "read initial Repair Status Event",
      );
      expect(events.data).toEqual([
        {
          from_status: null,
          to_status: "IN_PROGRESS",
          changed_by_user_id: owner.user.id,
        },
      ]);

      const repeatedAcceptance = await auth.client.rpc(
        "create_repair_from_request",
        verifiedRepairInput(requestId),
      );
      expect(repeatedAcceptance.error?.message).toMatch(
        /REQUEST_ALREADY_PROCESSED/,
      );

      const declineAfterAcceptance = await auth.client.rpc(
        "decline_repair_request",
        { p_request_id: requestId },
      );
      expect(declineAfterAcceptance.error?.message).toMatch(
        /REQUEST_ALREADY_PROCESSED/,
      );

      const requestAfterTerminalRetries = assertSupabaseSuccess(
        await adminClient
          .from("repair_requests")
          .select("status, accepted_at, accepted_by_user_id")
          .eq("id", requestId)
          .single(),
        "read accepted Request after terminal retries",
      );
      expect(requestAfterTerminalRetries.data).toEqual(durableRequest.data);

      const repairAfterTerminalRetries = assertSupabaseSuccess(
        await adminClient
          .from("repairs")
          .select(
            "id, origin, current_status, customer_name, customer_phone, brand, model, diagnosis, internal_notes, ticket_number, tracking_code",
          )
          .eq("repair_request_id", requestId)
          .single(),
        "read accepted Repair after terminal retries",
      );
      expect(repairAfterTerminalRetries.data).toEqual(repair.data);

      const acceptedOutcome = await readRepairRequestOutcome(
        adminClient,
        requestId,
      );
      expect(acceptedOutcome.request.status).toBe("ACCEPTED");
      expect(acceptedOutcome.repairs).toEqual([
        { id: repair.data.id, current_status: "IN_PROGRESS" },
      ]);
      expect(acceptedOutcome.events).toEqual([
        {
          repair_id: repair.data.id,
          from_status: null,
          to_status: "IN_PROGRESS",
        },
      ]);
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: [provider.providerId],
        userIds: [owner.user.id],
      });
    }
  });

  it("direct Provider creation starts one IN_PROGRESS Repair with one initial event", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("direct-repair-owner"),
      password,
    );
    const auth = await signInTestUser(owner.email, password);
    const provider = await createProviderAs(auth.client);

    try {
      assertSupabaseSuccess(
        await auth.client.rpc("set_provider_service_modes", {
          p_service_modes: [{ mode: "DROP_OFF" }],
        }),
        "configure direct Repair Service Modes",
      );

      const created = assertSupabaseSuccess(
        await auth.client.rpc("create_provider_repair", directRepairInput()),
        "create direct Provider Repair",
      );
      const receipt = Array.isArray(created.data)
        ? created.data[0]
        : created.data;
      expect(receipt.current_status).toBe("IN_PROGRESS");
      expect(receipt.ticket_number).toMatch(/^TN-[0-9]{4}-[A-F0-9]{10}$/);
      expect(receipt.tracking_code).toMatch(/^TRK-[A-F0-9]{24}$/);

      const repair = assertSupabaseSuccess(
        await adminClient
          .from("repairs")
          .select(
            "id, provider_id, repair_request_id, origin, current_status, customer_name, diagnosis, internal_notes, created_by_user_id",
          )
          .eq("id", receipt.repair_id)
          .single(),
        "read direct Provider Repair",
      );
      expect(repair.data).toMatchObject({
        provider_id: provider.providerId,
        repair_request_id: null,
        origin: "PROVIDER_CREATED",
        current_status: "IN_PROGRESS",
        customer_name: "Direct Customer",
        diagnosis: "Damaged charging port",
        internal_notes: "Private direct-intake note",
        created_by_user_id: owner.user.id,
      });

      const events = assertSupabaseSuccess(
        await adminClient
          .from("repair_status_events")
          .select("from_status, to_status, changed_by_user_id")
          .eq("repair_id", receipt.repair_id),
        "read direct Repair initial event",
      );
      expect(events.data).toEqual([
        {
          from_status: null,
          to_status: "IN_PROGRESS",
          changed_by_user_id: owner.user.id,
        },
      ]);

      const directInsert = await auth.client.from("repairs").insert({
        provider_id: provider.providerId,
      });
      expect(directInsert.error).not.toBeNull();

      const detailEdit = assertSupabaseMutation(
        await auth.client
          .from("repairs")
          .update({ diagnosis: "Updated diagnosis" })
          .eq("id", receipt.repair_id)
          .select("diagnosis"),
        "update allow-listed Repair details",
      );
      expect(detailEdit.data?.[0]?.diagnosis).toBe("Updated diagnosis");

      const forbiddenStatusEdit = await auth.client
        .from("repairs")
        .update({ current_status: "READY" })
        .eq("id", receipt.repair_id);
      expect(forbiddenStatusEdit.error).not.toBeNull();
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: [provider.providerId],
        userIds: [owner.user.id],
      });
    }
  });

  it("preserves a historical Service Mode during an unrelated detail edit", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("historical-mode-owner"),
      password,
    );
    const auth = await signInTestUser(owner.email, password);
    const provider = await createProviderAs(auth.client);

    try {
      assertSupabaseSuccess(
        await auth.client.rpc("set_provider_service_modes", {
          p_service_modes: [{ mode: "HOME_SERVICE" }],
        }),
        "configure historical Repair Service Mode",
      );
      const created = assertSupabaseSuccess(
        await auth.client.rpc(
          "create_provider_repair",
          directRepairInput({
            p_service_mode: "HOME_SERVICE",
            p_service_mode_details: "Customer home visit",
          }),
        ),
        "create Repair with historical Service Mode",
      );
      const receipt = Array.isArray(created.data)
        ? created.data[0]
        : created.data;

      assertSupabaseSuccess(
        await auth.client.rpc("set_provider_service_modes", {
          p_service_modes: [],
        }),
        "remove historical Repair Service Mode from Provider settings",
      );

      const updated = await updateRepairDetails(
        receipt.repair_id,
        {
          customerName: "Direct Customer",
          customerPhone: "+63 917 555 0111",
          customerEmail: "direct@example.test",
          deviceType: "Laptop",
          brand: "Lenovo",
          model: "IdeaPad 3",
          serialNumber: "DIRECT-SERIAL-123",
          colorVariant: "Gray",
          deviceSpecs: "16 GB RAM",
          physicalCondition: "Light scratches",
          accessoriesReceived: "Charger",
          reportedProblem: "Battery does not charge",
          initialObservation: "Charging port is loose",
          diagnosis: "Diagnosis updated without changing the arrangement",
          internalNotes: "Private direct-intake note",
          serviceModeDetails: "Customer home visit",
        },
        auth.client,
      );

      expect(updated).toMatchObject({
        diagnosis: "Diagnosis updated without changing the arrangement",
        serviceMode: "HOME_SERVICE",
        serviceModeDetails: "Customer home visit",
      });
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: [provider.providerId],
        userIds: [owner.user.id],
      });
    }
  });

  it("rejects a direct unsupported Repair Service Mode replacement", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("unsupported-mode-owner"),
      password,
    );
    const auth = await signInTestUser(owner.email, password);
    const provider = await createProviderAs(auth.client);

    try {
      assertSupabaseSuccess(
        await auth.client.rpc("set_provider_service_modes", {
          p_service_modes: [{ mode: "DROP_OFF" }],
        }),
        "configure one supported Repair Service Mode",
      );
      const created = assertSupabaseSuccess(
        await auth.client.rpc("create_provider_repair", directRepairInput()),
        "create Repair before unsupported direct update",
      );
      const receipt = Array.isArray(created.data)
        ? created.data[0]
        : created.data;

      const unsupported = await auth.client
        .from("repairs")
        .update({ service_mode: "HOME_SERVICE" })
        .eq("id", receipt.repair_id)
        .select("service_mode");
      expect(unsupported.error?.message).toMatch(/UNSUPPORTED_SERVICE_MODE/);

      const durable = await getRepair(receipt.repair_id, auth.client);
      expect(durable?.serviceMode).toBe("DROP_OFF");
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: [provider.providerId],
        userIds: [owner.user.id],
      });
    }
  });

  it("serializes Repair Service Mode edits with Provider mode replacement", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("repair-mode-race-owner"),
      password,
    );
    const auth = await signInTestUser(owner.email, password);
    const editClient = createAuthenticatedClient(auth.session);
    const settingsClient = createAuthenticatedClient(auth.session);
    const provider = await createProviderAs(auth.client);

    try {
      assertSupabaseSuccess(
        await auth.client.rpc("set_provider_service_modes", {
          p_service_modes: [{ mode: "DROP_OFF" }, { mode: "HOME_SERVICE" }],
        }),
        "configure Service Modes before Repair edit race",
      );
      const created = assertSupabaseSuccess(
        await auth.client.rpc("create_provider_repair", directRepairInput()),
        "create Repair before Service Mode edit race",
      );
      const receipt = Array.isArray(created.data)
        ? created.data[0]
        : created.data;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        assertSupabaseSuccess(
          await auth.client.rpc("set_provider_service_modes", {
            p_service_modes: [{ mode: "DROP_OFF" }, { mode: "HOME_SERVICE" }],
          }),
          `restore Service Modes before Repair edit race ${attempt + 1}`,
        );
        assertSupabaseMutation(
          await auth.client
            .from("repairs")
            .update({ service_mode: "DROP_OFF" })
            .eq("id", receipt.repair_id)
            .select("service_mode"),
          `restore Repair Service Mode before race ${attempt + 1}`,
        );

        const [edit, replacement] = await Promise.all([
          editClient
            .from("repairs")
            .update({ service_mode: "HOME_SERVICE" })
            .eq("id", receipt.repair_id)
            .select("service_mode"),
          settingsClient.rpc("set_provider_service_modes", {
            p_service_modes: [{ mode: "DROP_OFF" }],
          }),
        ]);

        expect(replacement.error).toBeNull();
        const durable = await getRepair(receipt.repair_id, auth.client);
        if (edit.error) {
          expect(edit.error.message).toMatch(/UNSUPPORTED_SERVICE_MODE/);
          expect(durable?.serviceMode).toBe("DROP_OFF");
        } else {
          expect(edit.data?.[0]?.service_mode).toBe("HOME_SERVICE");
          expect(durable?.serviceMode).toBe("HOME_SERVICE");
        }

        const configured = assertSupabaseSuccess(
          await auth.client
            .from("provider_service_modes")
            .select("mode")
            .eq("provider_id", provider.providerId),
          `read Provider Service Modes after Repair edit race ${attempt + 1}`,
        );
        expect(configured.data).toEqual([{ mode: "DROP_OFF" }]);
      }
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: [provider.providerId],
        userIds: [owner.user.id],
      });
    }
  });

  it("Shop Staff can perform Provider Repair operations without Owner settings authority", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("repair-staff-owner"),
      password,
    );
    const staff = await createTestUser(
      adminClient,
      uniqueEmail("repair-staff-user"),
      password,
    );
    const ownerAuth = await signInTestUser(owner.email, password);
    const staffAuth = await signInTestUser(staff.email, password);
    const provider = await createProviderAs(ownerAuth.client);

    try {
      assertSupabaseSuccess(
        await ownerAuth.client.rpc("set_provider_service_modes", {
          p_service_modes: [{ mode: "DROP_OFF" }],
        }),
        "configure Staff Repair Service Modes",
      );
      const invitation = await createInvitationAs(
        ownerAuth.client,
        staff.email,
      );
      assertSupabaseSuccess(
        await acceptInvitationAs(staffAuth.client, invitation.tokenHash),
        "accept Staff Repair invitation",
      );

      const created = assertSupabaseSuccess(
        await staffAuth.client.rpc(
          "create_provider_repair",
          directRepairInput({ p_customer_name: "Staff Customer" }),
        ),
        "create Repair as Staff",
      );
      const receipt = Array.isArray(created.data)
        ? created.data[0]
        : created.data;
      const status = assertSupabaseSuccess(
        await staffAuth.client.rpc("change_repair_status", {
          p_repair_id: receipt.repair_id,
          p_next_status: "READY",
        }),
        "change Repair status as Staff",
      );
      expect(
        Array.isArray(status.data) ? status.data[0] : status.data,
      ).toMatchObject({ current_status: "READY" });

      const repair = assertSupabaseSuccess(
        await adminClient
          .from("repairs")
          .select("provider_id, created_by_user_id, current_status")
          .eq("id", receipt.repair_id)
          .single(),
        "read Staff-created Repair",
      );
      expect(repair.data).toEqual({
        provider_id: provider.providerId,
        created_by_user_id: staff.user.id,
        current_status: "READY",
      });
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: [provider.providerId],
        userIds: [owner.user.id, staff.user.id],
      });
    }
  });

  it("lifecycle transitions and Customer Updates remain consistent and separate", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("repair-lifecycle-owner"),
      password,
    );
    const auth = await signInTestUser(owner.email, password);
    const provider = await createProviderAs(auth.client);

    try {
      assertSupabaseSuccess(
        await auth.client.rpc("set_provider_service_modes", {
          p_service_modes: [{ mode: "DROP_OFF" }],
        }),
        "configure lifecycle Service Modes",
      );
      const created = assertSupabaseSuccess(
        await auth.client.rpc("create_provider_repair", directRepairInput()),
        "create lifecycle Repair",
      );
      const receipt = Array.isArray(created.data)
        ? created.data[0]
        : created.data;
      const repairId = receipt.repair_id;

      const update = assertSupabaseMutation(
        await auth.client
          .from("repair_updates")
          .insert({ repair_id: repairId, message: "Parts inspection started." })
          .select("repair_id, message, created_by_user_id"),
        "append Customer Update",
      );
      expect(update.data?.[0]).toEqual({
        repair_id: repairId,
        message: "Parts inspection started.",
        created_by_user_id: owner.user.id,
      });

      for (const nextStatus of [
        "WAITING_FOR_PARTS",
        "IN_PROGRESS",
        "READY",
        "COMPLETED",
      ]) {
        assertSupabaseSuccess(
          await auth.client.rpc("change_repair_status", {
            p_repair_id: repairId,
            p_next_status: nextStatus,
          }),
          `change Repair status to ${nextStatus}`,
        );
      }

      const completed = assertSupabaseSuccess(
        await adminClient
          .from("repairs")
          .select("current_status, completed_at")
          .eq("id", repairId)
          .single(),
        "read completed Repair",
      );
      expect(completed.data?.current_status).toBe("COMPLETED");
      expect(completed.data?.completed_at).toBeTruthy();

      const events = assertSupabaseSuccess(
        await adminClient
          .from("repair_status_events")
          .select("from_status, to_status")
          .eq("repair_id", repairId)
          .order("created_at", { ascending: true }),
        "read lifecycle history",
      );
      expect(events.data).toEqual([
        { from_status: null, to_status: "IN_PROGRESS" },
        { from_status: "IN_PROGRESS", to_status: "WAITING_FOR_PARTS" },
        { from_status: "WAITING_FOR_PARTS", to_status: "IN_PROGRESS" },
        { from_status: "IN_PROGRESS", to_status: "READY" },
        { from_status: "READY", to_status: "COMPLETED" },
      ]);

      const reopen = await auth.client.rpc("change_repair_status", {
        p_repair_id: repairId,
        p_next_status: "IN_PROGRESS",
      });
      expect(reopen.error?.message).toMatch(/INVALID_STATUS_TRANSITION/);

      const updateMutation = await auth.client
        .from("repair_updates")
        .update({ message: "tampered" })
        .eq("repair_id", repairId);
      const updateDeletion = await auth.client
        .from("repair_updates")
        .delete()
        .eq("repair_id", repairId);
      expect(updateMutation.error).not.toBeNull();
      expect(updateDeletion.error).not.toBeNull();
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: [provider.providerId],
        userIds: [owner.user.id],
      });
    }
  });

  it("cross-Provider and concurrent Repair transitions cannot corrupt lifecycle state", async () => {
    const ownerA = await createTestUser(
      adminClient,
      uniqueEmail("repair-race-a"),
      password,
    );
    const ownerB = await createTestUser(
      adminClient,
      uniqueEmail("repair-race-b"),
      password,
    );
    const authA = await signInTestUser(ownerA.email, password);
    const authB = await signInTestUser(ownerB.email, password);
    const providerA = await createProviderAs(authA.client);
    const providerB = await createProviderAs(authB.client);

    try {
      assertSupabaseSuccess(
        await authA.client.rpc("set_provider_service_modes", {
          p_service_modes: [{ mode: "DROP_OFF" }],
        }),
        "configure transition-race Service Modes",
      );
      const created = assertSupabaseSuccess(
        await authA.client.rpc("create_provider_repair", directRepairInput()),
        "create transition-race Repair",
      );
      const receipt = Array.isArray(created.data)
        ? created.data[0]
        : created.data;
      const repairId = receipt.repair_id;

      expect(
        await authB.client.from("repairs").select("id").eq("id", repairId),
      ).toMatchObject({ data: [] });
      expect(
        (
          await authB.client.rpc("change_repair_status", {
            p_repair_id: repairId,
            p_next_status: "READY",
          })
        ).error?.message,
      ).toMatch(/REPAIR_NOT_FOUND/);
      expect(
        (
          await authB.client.from("repair_updates").insert({
            repair_id: repairId,
            message: "Cross-Provider update",
          })
        ).error,
      ).not.toBeNull();

      const attempts = await Promise.all([
        authA.client.rpc("change_repair_status", {
          p_repair_id: repairId,
          p_next_status: "WAITING_FOR_PARTS",
        }),
        authA.client.rpc("change_repair_status", {
          p_repair_id: repairId,
          p_next_status: "READY",
        }),
      ]);
      expect(attempts.filter((attempt) => !attempt.error)).toHaveLength(1);
      expect(attempts.filter((attempt) => attempt.error)).toHaveLength(1);
      expect(attempts.find((attempt) => attempt.error)?.error?.message).toMatch(
        /INVALID_STATUS_TRANSITION/,
      );

      const durable = assertSupabaseSuccess(
        await adminClient
          .from("repairs")
          .select("current_status")
          .eq("id", repairId)
          .single(),
        "read durable concurrent Repair status",
      );
      expect(["WAITING_FOR_PARTS", "READY"]).toContain(
        durable.data?.current_status,
      );
      const events = assertSupabaseSuccess(
        await adminClient
          .from("repair_status_events")
          .select("from_status, to_status")
          .eq("repair_id", repairId),
        "read concurrent Repair events",
      );
      expect(events.data).toHaveLength(2);
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: [providerA.providerId, providerB.providerId],
        userIds: [ownerA.user.id, ownerB.user.id],
      });
    }
  });

  it("Repair list pagination, search, status filters, and Provider isolation compose", async () => {
    const ownerA = await createTestUser(
      adminClient,
      uniqueEmail("repair-list-a"),
      password,
    );
    const ownerB = await createTestUser(
      adminClient,
      uniqueEmail("repair-list-b"),
      password,
    );
    const authA = await signInTestUser(ownerA.email, password);
    const authB = await signInTestUser(ownerB.email, password);
    const providerA = await createProviderAs(authA.client);
    const providerB = await createProviderAs(authB.client);

    const repairRow = (
      providerId: string,
      userId: string,
      number: number,
      overrides: Record<string, unknown> = {},
    ) => {
      const suffix = number.toString(16).toUpperCase().padStart(10, "0");
      const tracking = number.toString(16).toUpperCase().padStart(24, "0");
      return {
        provider_id: providerId,
        repair_request_id: null,
        origin: "PROVIDER_CREATED",
        ticket_number: `TN-2026-${suffix}`,
        tracking_code: `TRK-${tracking}`,
        customer_name: `Customer ${number}`,
        customer_phone: "+63 917 555 0101",
        customer_email: null,
        device_type: "Laptop",
        reported_problem: "Pagination fixture problem",
        current_status: "READY",
        created_by_user_id: userId,
        ...overrides,
      };
    };

    try {
      const readyRows = Array.from({ length: 60 }, (_, index) =>
        repairRow(providerA.providerId, ownerA.user.id, index + 1),
      );
      assertSupabaseMutation(
        await adminClient
          .from("repairs")
          .insert([
            ...readyRows,
            repairRow(providerA.providerId, ownerA.user.id, 61, {
              customer_name: "Needle Customer",
              device_type: "NeedleLaptop",
              current_status: "IN_PROGRESS",
            }),
            repairRow(providerA.providerId, ownerA.user.id, 62, {
              customer_name: "O'Connor",
              device_type: "A/B",
              brand: "AT&T",
              model: "Galaxy S23+",
              current_status: "IN_PROGRESS",
            }),
            repairRow(providerA.providerId, ownerA.user.id, 63, {
              current_status: "WAITING_FOR_PARTS",
            }),
            repairRow(providerA.providerId, ownerA.user.id, 64, {
              current_status: "AWAITING_APPROVAL",
            }),
            repairRow(providerB.providerId, ownerB.user.id, 999),
          ])
          .select("id"),
        "insert Repair list fixtures",
      );

      const first = await listRepairs(
        { status: "READY", page: 1 },
        authA.client,
      );
      const second = await listRepairs(
        { status: "READY", page: 2 },
        authA.client,
      );
      const third = await listRepairs(
        { status: "READY", page: 3 },
        authA.client,
      );
      expect([
        first.items.length,
        second.items.length,
        third.items.length,
      ]).toEqual([25, 25, 10]);
      expect(first).toMatchObject({
        page: 1,
        hasPrevious: false,
        hasNext: true,
      });
      expect(third).toMatchObject({
        page: 3,
        hasPrevious: true,
        hasNext: false,
      });
      expect(
        new Set(
          [...first.items, ...second.items, ...third.items].map(
            (repair) => repair.id,
          ),
        ).size,
      ).toBe(60);

      const searched = await listRepairs({ query: "Needle" }, authA.client);
      expect(searched.items).toHaveLength(1);
      expect(searched.items[0]).toMatchObject({
        customerName: "Needle Customer",
        currentStatus: "IN_PROGRESS",
      });

      for (const query of ["O'Connor", "Galaxy S23+", "AT&T", "A/B"]) {
        const punctuationSearch = await listRepairs({ query }, authA.client);
        expect(punctuationSearch.items).toHaveLength(1);
        expect(punctuationSearch.items[0]).toMatchObject({
          customerName: "O'Connor",
          deviceType: "A/B",
          brand: "AT&T",
          model: "Galaxy S23+",
        });
      }

      const filterGrammarSearch = await listRepairs(
        { query: "Needle),current_status.eq.READY" },
        authA.client,
      );
      expect(filterGrammarSearch.items).toEqual([]);

      const waiting = await listRepairs({ status: "WAITING" }, authA.client);
      expect(
        waiting.items.map((repair) => repair.currentStatus).sort(),
      ).toEqual(["AWAITING_APPROVAL", "WAITING_FOR_PARTS"]);

      const providerBPage = await listRepairs({}, authB.client);
      expect(providerBPage.items).toHaveLength(1);
      expect(providerBPage.items[0]?.ticketNumber).toBe("TN-2026-00000003E7");
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: [providerA.providerId, providerB.providerId],
        userIds: [ownerA.user.id, ownerB.user.id],
      });
    }
  });

  it("anonymous Tracking returns a bounded allow-listed view after Provider closes Requests", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("public-tracking-owner"),
      password,
    );
    const auth = await signInTestUser(owner.email, password);
    const provider = await createProviderAs(auth.client, {
      displayName: "Public Tracking Provider",
    });

    try {
      assertSupabaseSuccess(
        await auth.client.rpc("set_provider_service_modes", {
          p_service_modes: [{ mode: "DROP_OFF" }],
        }),
        "configure public Tracking Service Modes",
      );
      const created = assertSupabaseSuccess(
        await auth.client.rpc("create_provider_repair", directRepairInput()),
        "create public Tracking Repair",
      );
      const receipt = Array.isArray(created.data)
        ? created.data[0]
        : created.data;

      const updateRows = Array.from({ length: 27 }, (_, index) => ({
        repair_id: receipt.repair_id,
        message: `Customer-visible update ${index + 1}`,
        created_by_user_id: owner.user.id,
        created_at: new Date(Date.UTC(2026, 7, 24, index)).toISOString(),
      }));
      assertSupabaseMutation(
        await adminClient
          .from("repair_updates")
          .insert(updateRows)
          .select("id"),
        "insert bounded public Tracking updates",
      );
      assertSupabaseMutation(
        await adminClient
          .from("providers")
          .update({ accepting_requests: false })
          .eq("id", provider.providerId)
          .select("id"),
        "close Provider Requests before public Tracking",
      );

      const repairTiming = assertSupabaseSuccess(
        await adminClient
          .from("repairs")
          .select("updated_at")
          .eq("id", receipt.repair_id)
          .single(),
        "read Repair activity timestamp for public Tracking",
      );
      const repairUpdatedAt = repairTiming.data?.updated_at;
      if (!repairUpdatedAt) {
        throw new Error("Public Tracking Repair timestamp was not found");
      }
      const latestCustomerUpdateAt = Math.max(
        ...updateRows.map((update) => Date.parse(update.created_at)),
      );

      const lookup = assertSupabaseSuccess(
        await serviceClient.rpc("lookup_public_repair", {
          p_tracking_code: receipt.tracking_code,
        }),
        "look up direct Repair publicly",
      );
      const publicRow = Array.isArray(lookup.data)
        ? lookup.data[0]
        : lookup.data;
      if (!publicRow) {
        throw new Error("Public Tracking lookup returned no Repair");
      }

      expect(Object.keys(publicRow).sort()).toEqual([
        "brand",
        "current_status",
        "customer_updates",
        "device_type",
        "last_updated_at",
        "model",
        "provider_display_name",
        "reference_code",
        "service_mode",
        "tracking_type",
      ]);
      expect(publicRow).toMatchObject({
        provider_display_name: "Public Tracking Provider",
        device_type: "Laptop",
        brand: "Lenovo",
        model: "IdeaPad 3",
        current_status: "IN_PROGRESS",
        service_mode: "DROP_OFF",
        tracking_type: "REPAIR",
        reference_code: receipt.tracking_code,
      });

      const anonRpcLookup = await anonClient.rpc("lookup_public_repair", {
        p_tracking_code: receipt.tracking_code,
      });
      const memberRpcLookup = await auth.client.rpc("lookup_public_repair", {
        p_tracking_code: receipt.tracking_code,
      });
      expect(anonRpcLookup.error).not.toBeNull();
      expect(anonRpcLookup.error?.code).toBe("42501");
      expect(memberRpcLookup.error).not.toBeNull();
      expect(memberRpcLookup.error?.code).toBe("42501");
      expect(publicRow.customer_updates).toHaveLength(25);
      expect(publicRow.customer_updates[0]).toMatchObject({
        message: "Customer-visible update 27",
      });
      expect(publicRow.customer_updates[24]).toMatchObject({
        message: "Customer-visible update 3",
      });
      expect(Object.keys(publicRow.customer_updates[0]).sort()).toEqual([
        "created_at",
        "message",
      ]);
      expect(Date.parse(publicRow.last_updated_at)).toBe(
        Math.max(Date.parse(repairUpdatedAt), latestCustomerUpdateAt),
      );

      const anonTrackingEvents = await anonClient
        .from("tracking_events")
        .select("*");
      const memberTrackingEvents = await auth.client
        .from("tracking_events")
        .select("*");
      const anonTrackingInsert = await anonClient
        .from("tracking_events")
        .insert({ repair_id: receipt.repair_id })
        .select("id");
      const memberTrackingInsert = await auth.client
        .from("tracking_events")
        .insert({ repair_id: receipt.repair_id })
        .select("id");
      const memberTrackingUpdate = await auth.client
        .from("tracking_events")
        .update({ viewed_at: new Date().toISOString() })
        .eq("repair_id", receipt.repair_id)
        .select("id");
      const memberTrackingDelete = await auth.client
        .from("tracking_events")
        .delete()
        .eq("repair_id", receipt.repair_id)
        .select("id");
      expect(anonTrackingEvents.error).not.toBeNull();
      expect(memberTrackingEvents.error).not.toBeNull();
      expect(anonTrackingInsert.error).not.toBeNull();
      expect(memberTrackingInsert.error).not.toBeNull();
      expect(memberTrackingUpdate.error).not.toBeNull();
      expect(memberTrackingDelete.error).not.toBeNull();

      const oversizedObservation = assertSupabaseSuccess(
        await serviceClient.rpc("record_successful_tracking_view", {
          p_tracking_code: receipt.tracking_code.padStart(129, " "),
        }),
        "reject oversized direct Tracking observation input",
      );
      expect(oversizedObservation.data).toBeNull();
      const viewsAfterOversizedInput = assertSupabaseSuccess(
        await adminClient
          .from("tracking_events")
          .select("id")
          .eq("repair_id", receipt.repair_id),
        "verify oversized Tracking observation created no telemetry",
      );
      expect(viewsAfterOversizedInput.data).toEqual([]);

      for (const submittedCode of [
        receipt.tracking_code,
        `  ${receipt.tracking_code.toLowerCase()}  `,
        "TN-2026-0000000001",
        "TRK-FFFFFFFFFFFFFFFFFFFFFFFF",
      ]) {
        assertSupabaseSuccess(
          await serviceClient.rpc("record_successful_tracking_view", {
            p_tracking_code: submittedCode,
          }),
          "record a successful public Tracking view when eligible",
        );
      }

      const recordedViews = assertSupabaseSuccess(
        await adminClient
          .from("tracking_events")
          .select("*")
          .eq("repair_id", receipt.repair_id)
          .order("viewed_at", { ascending: true }),
        "read successful public Tracking views",
      );
      expect(recordedViews.data).toHaveLength(2);
      expect(recordedViews.data?.map((event) => event.repair_id)).toEqual([
        receipt.repair_id,
        receipt.repair_id,
      ]);
      expect(Object.keys(recordedViews.data?.[0] ?? {}).sort()).toEqual([
        "id",
        "repair_id",
        "viewed_at",
      ]);
      expect(
        new Set(recordedViews.data?.map((event) => event.repair_id)).size,
      ).toBe(1);

      for (const invalidCode of [
        "TN-2026-0000000001",
        "TRK-FFFFFFFFFFFFFFFFFFFFFFFF",
      ]) {
        const missing = assertSupabaseSuccess(
          await serviceClient.rpc("lookup_public_repair", {
            p_tracking_code: invalidCode,
          }),
          "hide malformed or unknown public Tracking lookup",
        );
        expect(missing.data).toEqual([]);
      }

      const rawRepairs = await anonClient.from("repairs").select("*");
      const rawUpdates = await anonClient.from("repair_updates").select("*");
      expect(rawRepairs.error).not.toBeNull();
      expect(rawUpdates.error).not.toBeNull();
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: [provider.providerId],
        userIds: [owner.user.id],
      });
    }
  });

  it("Request-origin Repair lifecycle and Customer Updates appear through the same public Tracking view", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("request-tracking-owner"),
      password,
    );
    const auth = await signInTestUser(owner.email, password);
    const provider = await createProviderAs(auth.client, {
      displayName: "Request Tracking Provider",
    });

    try {
      assertSupabaseSuccess(
        await auth.client.rpc("set_provider_service_modes", {
          p_service_modes: [{ mode: "DROP_OFF" }],
        }),
        "configure Request-origin Tracking Service Modes",
      );

      // 1. Check SUBMITTED request tracking via reference code
      const submitted = assertSupabaseSuccess(
        await submitRepairRequestAs(serviceClient, provider.slug),
        "submit Request for public Tracking",
      );
      const requestReceipt = Array.isArray(submitted.data)
        ? submitted.data[0]
        : submitted.data;
      const request = assertSupabaseSuccess(
        await adminClient
          .from("repair_requests")
          .select("id, submitted_at")
          .eq("reference_code", requestReceipt.reference_code)
          .single(),
        "resolve Request for public Tracking",
      );
      if (!request.data) {
        throw new Error("Public Tracking Request fixture was not created");
      }

      const submittedLookup = assertSupabaseSuccess(
        await serviceClient.rpc("lookup_public_repair", {
          p_tracking_code: requestReceipt.reference_code,
        }),
        "look up submitted Request publicly",
      );
      const submittedRow = Array.isArray(submittedLookup.data)
        ? submittedLookup.data[0]
        : submittedLookup.data;
      expect(submittedRow).toMatchObject({
        provider_display_name: "Request Tracking Provider",
        current_status: "SUBMITTED",
        tracking_type: "REQUEST",
        reference_code: requestReceipt.reference_code,
        customer_updates: [],
      });

      // 2. Check DECLINED request tracking via reference code
      const secondSubmitted = assertSupabaseSuccess(
        await submitRepairRequestAs(serviceClient, provider.slug),
        "submit second Request for decline testing",
      );
      const declinedReceipt = Array.isArray(secondSubmitted.data)
        ? secondSubmitted.data[0]
        : secondSubmitted.data;
      const secondRequest = assertSupabaseSuccess(
        await adminClient
          .from("repair_requests")
          .select("id")
          .eq("reference_code", declinedReceipt.reference_code)
          .single(),
        "resolve second Request for decline",
      );
      assertSupabaseSuccess(
        await auth.client.rpc("decline_repair_request", {
          p_request_id: secondRequest.data!.id,
        }),
        "decline second Request",
      );
      const declinedLookup = assertSupabaseSuccess(
        await serviceClient.rpc("lookup_public_repair", {
          p_tracking_code: declinedReceipt.reference_code,
        }),
        "look up declined Request publicly",
      );
      const declinedRow = Array.isArray(declinedLookup.data)
        ? declinedLookup.data[0]
        : declinedLookup.data;
      expect(declinedRow).toMatchObject({
        provider_display_name: "Request Tracking Provider",
        current_status: "DECLINED",
        tracking_type: "REQUEST",
        reference_code: declinedReceipt.reference_code,
        customer_updates: [],
      });

      // 3. Accept first Request, create Repair, append customer update, and change status
      const accepted = assertSupabaseSuccess(
        await auth.client.rpc(
          "create_repair_from_request",
          verifiedRepairInput(request.data.id),
        ),
        "accept Request for public Tracking",
      );
      const repairReceipt = Array.isArray(accepted.data)
        ? accepted.data[0]
        : accepted.data;
      assertSupabaseMutation(
        await auth.client
          .from("repair_updates")
          .insert({
            repair_id: repairReceipt.repair_id,
            message: "Repair is ready for the agreed handover.",
          })
          .select("id"),
        "append Request-origin Customer Update",
      );
      assertSupabaseSuccess(
        await auth.client.rpc("change_repair_status", {
          p_repair_id: repairReceipt.repair_id,
          p_next_status: "READY",
        }),
        "mark Request-origin Repair READY",
      );

      // Verify lookup using TRK tracking code
      const lookup = assertSupabaseSuccess(
        await serviceClient.rpc("lookup_public_repair", {
          p_tracking_code: repairReceipt.tracking_code,
        }),
        "look up Request-origin Repair publicly via TRK code",
      );
      const publicRow = Array.isArray(lookup.data)
        ? lookup.data[0]
        : lookup.data;
      expect(publicRow).toMatchObject({
        provider_display_name: "Request Tracking Provider",
        device_type: "Laptop",
        brand: "Verified Brand",
        model: "Verified Model",
        current_status: "READY",
        service_mode: "DROP_OFF",
        tracking_type: "REPAIR",
        reference_code: repairReceipt.tracking_code,
        customer_updates: [
          expect.objectContaining({
            message: "Repair is ready for the agreed handover.",
          }),
        ],
      });
      expect(publicRow).not.toHaveProperty("origin");
      expect(publicRow).not.toHaveProperty("ticket_number");
      expect(publicRow).not.toHaveProperty("tracking_code");

      // Verify lookup using original REQ reference code seamlessly resolves to active repair details
      const reqLookupAfterAccept = assertSupabaseSuccess(
        await serviceClient.rpc("lookup_public_repair", {
          p_tracking_code: requestReceipt.reference_code,
        }),
        "look up accepted Request publicly via REQ reference code",
      );
      const reqPublicRow = Array.isArray(reqLookupAfterAccept.data)
        ? reqLookupAfterAccept.data[0]
        : reqLookupAfterAccept.data;
      expect(reqPublicRow).toMatchObject({
        provider_display_name: "Request Tracking Provider",
        device_type: "Laptop",
        brand: "Verified Brand",
        model: "Verified Model",
        current_status: "READY",
        service_mode: "DROP_OFF",
        tracking_type: "REQUEST",
        reference_code: requestReceipt.reference_code,
        customer_updates: [
          expect.objectContaining({
            message: "Repair is ready for the agreed handover.",
          }),
        ],
      });

      assertSupabaseSuccess(
        await serviceClient.rpc("record_successful_tracking_view", {
          p_tracking_code: repairReceipt.tracking_code,
        }),
        "record Request-origin public Tracking view",
      );
      const recordedView = assertSupabaseSuccess(
        await adminClient
          .from("tracking_events")
          .select("repair_id")
          .eq("repair_id", repairReceipt.repair_id),
        "read Request-origin public Tracking view",
      );
      expect(recordedView.data).toEqual([
        { repair_id: repairReceipt.repair_id },
      ]);
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: [provider.providerId],
        userIds: [owner.user.id],
      });
    }
  });
});

describe("OWNER-controlled Staff offboarding (Plan 03)", () => {
  it("removes exactly one same-Provider STAFF membership and revokes access", async () => {
    const adminClient = createAdminClient();
    const owner = await createTestUser(adminClient);
    const staff = await createTestUser(adminClient);

    const ownerSignIn = await signInTestUser(owner.email!, password);
    const provider = await createProviderAs(ownerSignIn.client);

    try {
      const invitation = await createInvitationAs(
        ownerSignIn.client,
        staff.email!,
      );
      const staffSignIn = await signInTestUser(staff.email!, password);
      const accepted = assertSupabaseSuccess(
        await acceptInvitationAs(staffSignIn.client, invitation.tokenHash),
        "staff accepts invitation",
      );
      const staffMembershipId = (
        Array.isArray(accepted.data) ? accepted.data[0] : accepted.data
      ).membership_id;

      // Staff can read Provider-private rows while active.
      const beforeRemoval = assertSupabaseSuccess(
        await staffSignIn.client
          .from("provider_memberships")
          .select("id")
          .eq("provider_id", provider.providerId),
        "active Staff reads Provider memberships",
      );
      expect(beforeRemoval.data!.length).toBe(2);

      // A STAFF caller cannot perform offboarding.
      const staffAttempt = await staffSignIn.client.rpc("remove_staff_member", {
        p_membership_id: staffMembershipId,
      });
      expect(staffAttempt.error).toMatchObject({
        message: /Only Provider Owners/,
      });

      // Active Staff can mutate Provider Repairs.
      assertSupabaseSuccess(
        await ownerSignIn.client.rpc("set_provider_service_modes", {
          p_service_modes: [{ mode: "DROP_OFF" }],
        }),
        "configure offboarding Service Modes",
      );
      assertSupabaseSuccess(
        await staffSignIn.client.rpc(
          "create_provider_repair",
          directRepairInput({ p_customer_name: "Offboard Staff Customer" }),
        ),
        "active Staff creates a direct Repair",
      );

      const removal = assertSupabaseSuccess(
        await ownerSignIn.client.rpc("remove_staff_member", {
          p_membership_id: staffMembershipId,
        }),
        "Owner removes Staff",
      );
      const removalRow = Array.isArray(removal.data)
        ? removal.data[0]
        : removal.data;
      expect(removalRow).toBe(true);

      // The membership row is durably gone.
      const afterRemoval = assertSupabaseSuccess(
        await adminClient
          .from("provider_memberships")
          .select("id, role")
          .eq("provider_id", provider.providerId),
        "read memberships after removal",
      );
      expect(afterRemoval.data).toEqual([
        { id: expect.any(String), role: "OWNER" },
      ]);

      // Removed Staff immediately loses ProviderContext-backed access.
      const deniedRead = await staffSignIn.client
        .from("providers")
        .select("id")
        .eq("id", provider.providerId);
      expect(deniedRead.data).toEqual([]);

      // The same Repair mutation active Staff could perform is now denied.
      const deniedRepairMutation = await staffSignIn.client.rpc(
        "create_provider_repair",
        directRepairInput({ p_customer_name: "Removed Staff Customer" }),
      );
      expect(deniedRepairMutation.error).toMatchObject({
        message: /PROVIDER_CONTEXT_REQUIRED/,
      });

      // Removing an OWNER through this operation is refused.
      const ownerSelfAttempt = await ownerSignIn.client.rpc(
        "remove_staff_member",
        { p_membership_id: provider.membershipId },
      );
      assertSupabaseSuccess(ownerSelfAttempt, "attempt to remove OWNER");
      const ownerRow = Array.isArray(ownerSelfAttempt.data)
        ? ownerSelfAttempt.data[0]
        : ownerSelfAttempt.data;
      expect(ownerRow).toBe(false);
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: [provider.providerId],
        userIds: [owner.user.id, staff.user.id],
      });
    }
  });

  it("denies cross-Provider removal without revealing membership existence", async () => {
    const adminClient = createAdminClient();
    const ownerA = await createTestUser(adminClient);
    const ownerB = await createTestUser(adminClient);
    const staff = await createTestUser(adminClient);

    try {
      const signInA = await signInTestUser(ownerA.email!, password);
      const signInB = await signInTestUser(ownerB.email!, password);
      await createProviderAs(signInA.client);
      await createProviderAs(signInB.client);

      const invitation = await createInvitationAs(signInA.client, staff.email!);
      const staffSignIn = await signInTestUser(staff.email!, password);
      const accepted = assertSupabaseSuccess(
        await acceptInvitationAs(staffSignIn.client, invitation.tokenHash),
        "staff accepts invitation",
      );
      const staffMembershipId = (
        Array.isArray(accepted.data) ? accepted.data[0] : accepted.data
      ).membership_id;

      const crossTenantAttempt = assertSupabaseSuccess(
        await signInB.client.rpc("remove_staff_member", {
          p_membership_id: staffMembershipId,
        }),
        "cross-Provider Owner attempts removal",
      );
      const crossRow = Array.isArray(crossTenantAttempt.data)
        ? crossTenantAttempt.data[0]
        : crossTenantAttempt.data;
      expect(crossRow).toBe(false);

      // The targeted membership still exists.
      const stillPresent = assertSupabaseSuccess(
        await adminClient
          .from("provider_memberships")
          .select("id")
          .eq("id", staffMembershipId),
        "verify cross-Provider membership survived",
      );
      expect(stillPresent.data).toHaveLength(1);
    } finally {
      await cleanupFixture(adminClient, {
        userIds: [ownerA.user.id, ownerB.user.id, staff.user.id],
      });
    }
  });
});
