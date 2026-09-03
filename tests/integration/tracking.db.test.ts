import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import {
  cleanupFixture,
  assertSupabaseMutation,
  assertSupabaseSuccess,
  createAdminClient,
  createAnonClient,
  createTestUser,
  requireDbConfig,
  signInTestUser,
  uniqueEmail,
} from "./helpers/supabase-test-context";
import {
  createProviderAs,
  directRepairInput,
  submitRepairRequestAs,
  verifiedRepairInput,
} from "./helpers/shared-test-utils";

const password = "TestPassword123!";

requireDbConfig();

describe("Public Tracking & Observation", () => {
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
