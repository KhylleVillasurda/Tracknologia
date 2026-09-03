import { beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

vi.mock("server-only", () => ({}));

import {
  cleanupFixture,
  assertSupabaseSuccess,
  createAdminClient,
  createAnonClient,
  createTestUser,
  signInTestUser,
  requireDbConfig,
  uniqueEmail,
} from "./helpers/supabase-test-context";
import {
  opaqueActorKey,
  expectRpcPermissionDenied,
  checkPublicOperationLimit,
  submitRepairRequestAs,
} from "./helpers/shared-test-utils";

const password = "TestPassword123!";

requireDbConfig();

describe("Auth & Public Operation RPC Permissions", () => {
  let adminClient: ReturnType<typeof createAdminClient>;
  let anonClient: ReturnType<typeof createAnonClient>;
  let serviceClient: ReturnType<typeof createAdminClient>;

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
});
