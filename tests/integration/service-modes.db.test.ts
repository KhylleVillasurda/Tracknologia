import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

vi.mock("server-only", () => ({}));

import { hashInvitationToken } from "@/features/providers/persistence";
import { getRepair } from "@/features/repairs";
import {
  cleanupFixture,
  assertSupabaseMutation,
  assertSupabaseSuccess,
  createAdminClient,
  createTestUser,
  signInTestUser,
  requireDbConfig,
  uniqueEmail,
  uniqueName,
  createAuthenticatedClient,
} from "./helpers/supabase-test-context";
import {
  createProviderAs,
  directRepairInput,
} from "./helpers/shared-test-utils";

requireDbConfig();

const password = "TestPassword123!";

const adminClient = createAdminClient();

async function createInvitationAs(
  client: ReturnType<typeof createAuthenticatedClient>,
  email = uniqueEmail("staff"),
) {
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
  client: ReturnType<typeof createAuthenticatedClient>,
  tokenHash: string,
  displayName = uniqueName("Staff"),
) {
  return client.rpc("accept_staff_invitation", {
    p_token_hash: tokenHash,
    p_display_name: displayName,
    p_contact_phone: null,
  });
}

describe("Service Mode Operations", () => {
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
});
