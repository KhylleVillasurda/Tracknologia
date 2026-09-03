import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

vi.mock("server-only", () => ({}));

import { hashInvitationToken } from "@/features/providers/persistence";
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
  uniqueName,
} from "./helpers/supabase-test-context";
import { createProviderAs } from "./helpers/shared-test-utils";

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

requireDbConfig();

let adminClient: SupabaseClient;
let anonClient: SupabaseClient;

beforeAll(() => {
  adminClient = createAdminClient();
  anonClient = createAnonClient();
});

const password = "TestPassword123!";

describe("Providers & Provider Settings", () => {
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
});
