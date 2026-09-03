import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import { listRepairRequests } from "@/features/repair-requests";
import {
  cleanupFixture,
  assertSupabaseSuccess,
  assertSupabaseMutation,
  createAdminClient,
  createAnonClient,
  createTestUser,
  signInTestUser,
  requireDbConfig,
  uniqueEmail,
  uniqueName,
} from "./helpers/supabase-test-context";
import {
  createProviderAs,
  submitRepairRequestAs,
  verifiedRepairInput,
  readRepairRequestOutcome,
} from "./helpers/shared-test-utils";

requireDbConfig();

let adminClient: SupabaseClient;
let anonClient: SupabaseClient;
let serviceClient: SupabaseClient;

beforeAll(() => {
  adminClient = createAdminClient();
  anonClient = createAnonClient();
  serviceClient = createAdminClient();
});

const password = "TestPassword123!";

describe("Repair Requests", () => {
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
});
