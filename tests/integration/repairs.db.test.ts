import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import { listRepairs, updateRepairDetails } from "@/features/repairs";
import {
  cleanupFixture,
  assertSupabaseSuccess,
  assertSupabaseMutation,
  createAdminClient,
  createTestUser,
  signInTestUser,
  requireDbConfig,
  uniqueEmail,
} from "./helpers/supabase-test-context";
import {
  createProviderAs,
  directRepairInput,
} from "./helpers/shared-test-utils";

requireDbConfig();

let adminClient: SupabaseClient;

beforeAll(() => {
  adminClient = createAdminClient();
});

const password = "TestPassword123!";

describe("Repairs & Repair Lifecycle", () => {
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
});
