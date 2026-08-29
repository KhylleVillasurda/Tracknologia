import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock server-only in test environment
vi.mock("server-only", () => ({}));

vi.mock("@/features/auth", () => ({
  requireProviderRole: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("@/lib/email/client", () => ({
  sendStaffInviteEmail: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("./persistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./persistence")>()),
  removeStaffMemberRecord: vi.fn(),
}));

import {
  createIndependentProviderSchema,
  createShopProviderSchema,
  staffInvitationSchema,
  acceptStaffInvitationSchema,
  providerServiceModesSchema,
  removeStaffMemberSchema,
} from "./schemas";
import {
  hashInvitationToken,
  createProviderWithOwner,
  acceptStaffInvitation as acceptStaffInvitationPersistence,
  insertStaffInvitationRecord,
  listTeamMembers,
  getPublicProviderProfile,
  removeStaffMemberRecord as mockedRemoveStaffMemberRecord,
} from "./persistence";
import {
  removeStaffMember,
  createStaffInvitation,
  StaffInvitationError,
} from "./commands";
import { requireProviderRole } from "@/features/auth";
import { sendStaffInviteEmail } from "@/lib/email/client";
import type { SupabaseClient } from "@supabase/supabase-js";

// The unmocked original is used directly by persistence-behavior tests below,
// while the mocked export above backs the feature-interface tests.
const { removeStaffMemberRecord: realRemoveStaffMemberRecord } =
  await vi.importActual<typeof import("./persistence")>("./persistence");

const mockRequireProviderRole = vi.mocked(requireProviderRole);
const mockRemoveStaffMemberRecord = vi.mocked(mockedRemoveStaffMemberRecord);
const mockSendStaffInviteEmail = vi.mocked(sendStaffInviteEmail);

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
    "sb_pub_test_123456789012345678901234567890";
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    "sb_service_test_123456789012345678901234567890";
  process.env.PUBLIC_ABUSE_HMAC_SECRET =
    "test_hmac_secret_32_chars_minimum_length_12345";
  process.env.PUBLIC_ABUSE_TRUSTED_PROXY_SECRET =
    "test_proxy_secret_32_chars_minimum_length_67890";
});

function ownerContext() {
  return {
    userId: "user-owner-1",
    providerId: "prov-shop-1",
    role: "OWNER",
    providerType: "SHOP",
    providerName: "Apex Electronics",
  } as unknown as Awaited<ReturnType<typeof requireProviderRole>>;
}

const membershipId = "0b8f6d0e-7c1a-4a5e-9a2b-3c4d5e6f7a8b";

function createMockSupabase(options: {
  rpcData?: unknown;
  rpcDataSequence?: unknown[];
  rpcError?: Error | null;
  tableData?: unknown;
  tableError?: Error | null;
}) {
  return {
    rpc: vi.fn().mockImplementation((fn: string) => {
      if (options.rpcError) {
        return Promise.resolve({ data: null, error: options.rpcError });
      }
      if (fn === "create_provider_with_owner_and_modes") {
        return Promise.resolve({
          data: options.rpcData ?? [
            {
              provider_id: "prov-123",
              membership_id: "mem-123",
              slug: "apex-repairs",
            },
          ],
          error: null,
        });
      }
      if (fn === "accept_staff_invitation") {
        return Promise.resolve({
          data: options.rpcData ?? [
            {
              provider_id: "prov-shop-123",
              membership_id: "mem-staff-123",
              role: "STAFF",
            },
          ],
          error: null,
        });
      }
      if (fn === "create_staff_invitation") {
        return Promise.resolve({
          data: options.rpcDataSequence?.shift() ??
            options.rpcData ?? [
              {
                invitation_id: "inv-new-123",
                provider_id: "prov-123",
                email: "tech@shop.com",
                role: "STAFF",
                created_at: "2026-08-20T00:00:00Z",
                expires_at: "2026-08-27T00:00:00Z",
              },
            ],
          error: null,
        });
      }
      if (fn === "revoke_staff_invitation") {
        return Promise.resolve({
          data: true,
          error: null,
        });
      }
      if (fn === "remove_staff_member") {
        return Promise.resolve({
          data: options.rpcData ?? true,
          error: null,
        });
      }
      if (fn === "get_invitation_details") {
        return Promise.resolve({
          data: options.rpcData ?? [
            {
              invitation_id: "inv-123",
              email: "staff@shop.com",
              role: "STAFF",
              provider_id: "prov-123",
              shop_name: "Apex Electronics",
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    }),
    from: vi.fn().mockImplementation(() => {
      const mockQuery: Record<string, unknown> = {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: "inv-new-123",
                provider_id: "prov-123",
                email: "tech@shop.com",
                role: "STAFF",
                invited_by_user_id: "user-owner",
                created_at: "2026-08-20T00:00:00Z",
                expires_at: "2026-08-27T00:00:00Z",
                accepted_at: null,
                accepted_by_user_id: null,
                revoked_at: null,
              },
              error: null,
            }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: "inv-active-1",
                        provider_id: "prov-123",
                        email: "active@shop.com",
                        role: "STAFF",
                        invited_by_user_id: "owner-1",
                        created_at: "2026-08-20T00:00:00Z",
                        expires_at: "2026-08-27T00:00:00Z",
                        accepted_at: null,
                        accepted_by_user_id: null,
                        revoked_at: null,
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "prov-123",
                provider_type: "SHOP",
                display_name: "Apex Electronics",
                slug: "apex-electronics",
                supported_devices: ["Smartphones"],
                service_modes: [
                  { mode: "DROP_OFF", details: null },
                  { mode: "HOME_SERVICE", details: null },
                ],
                accepting_requests: true,
                created_at: "2026-08-20T00:00:00Z",
              },
              error: null,
            }),
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "mem-1",
                  provider_id: "prov-123",
                  user_id: "user-1",
                  role: "OWNER",
                  created_at: "2026-08-20T00:00:00Z",
                },
              ],
              error: null,
            }),
          }),
          in: vi.fn().mockResolvedValue({
            data: [
              {
                user_id: "user-1",
                display_name: "Maria Santos",
                contact_phone: "+63 912 345 6789",
              },
            ],
            error: null,
          }),
        }),
      };
      return mockQuery;
    }),
  } as unknown as SupabaseClient;
}

describe("Providers Module — Schemas Validation", () => {
  it("validates Independent provider onboarding inputs with ownerName separation", () => {
    const valid = createIndependentProviderSchema.safeParse({
      ownerName: "Alex Martinez",
      displayName: "Alex Tech Services",
      serviceArea: "Metro Cebu",
      supportedDevices: ["Smartphones", "Tablets"],
    });
    expect(valid.success).toBe(true);

    const missingOwner = createIndependentProviderSchema.safeParse({
      ownerName: "",
      displayName: "Alex Tech Services",
    });
    expect(missingOwner.success).toBe(false);

    const missingBrand = createIndependentProviderSchema.safeParse({
      ownerName: "Alex Martinez",
      displayName: "",
    });
    expect(missingBrand.success).toBe(false);
  });

  it("validates Shop provider onboarding inputs with ownerName separation", () => {
    const valid = createShopProviderSchema.safeParse({
      ownerName: "Maria Santos",
      displayName: "Apex Electronics",
      publicAddress: "123 Tech Lane",
      serviceArea: "Cebu City",
      supportedDevices: ["Laptops & PCs"],
    });
    expect(valid.success).toBe(true);

    const invalid = createShopProviderSchema.safeParse({
      ownerName: "",
      displayName: "Apex Electronics",
    });
    expect(invalid.success).toBe(false);
  });

  it("validates Staff invitation inputs", () => {
    expect(
      staffInvitationSchema.safeParse({ email: "tech@shop.com" }).success,
    ).toBe(true);
    expect(
      staffInvitationSchema.safeParse({ email: "invalid-email" }).success,
    ).toBe(false);
  });

  it("validates Accept staff invitation inputs", () => {
    const validToken = `inv_${"a".repeat(48)}`;

    expect(
      acceptStaffInvitationSchema.safeParse({
        token: validToken,
        displayName: "Carlos Gomez",
        contactPhone: "+63 912 345 6789",
      }).success,
    ).toBe(true);

    expect(
      acceptStaffInvitationSchema.safeParse({
        token: "",
        displayName: "Carlos Gomez",
      }).success,
    ).toBe(false);

    expect(
      acceptStaffInvitationSchema.safeParse({
        token: "inv_123",
        displayName: "C",
      }).success,
    ).toBe(false);
  });

  it("validates unique Provider Service Modes", () => {
    expect(
      providerServiceModesSchema.safeParse([
        { mode: "DROP_OFF" },
        { mode: "HOME_SERVICE" },
      ]).success,
    ).toBe(true);

    expect(
      providerServiceModesSchema.safeParse([
        { mode: "MEETUP" },
        { mode: "MEETUP" },
      ]).success,
    ).toBe(false);
  });

  it("validates staff removal membership identifiers", () => {
    expect(
      removeStaffMemberSchema.safeParse({
        membershipId: "0b8f6d0e-7c1a-4a5e-9a2b-3c4d5e6f7a8b",
      }).success,
    ).toBe(true);

    expect(
      removeStaffMemberSchema.safeParse({ membershipId: "" }).success,
    ).toBe(false);
    expect(
      removeStaffMemberSchema.safeParse({ membershipId: "not-a-uuid" }).success,
    ).toBe(false);
  });
});

describe("Providers Module — Persistence & Token Hashing", () => {
  it("hashInvitationToken computes deterministic SHA-256 hex digest", () => {
    const rawToken = "inv_sample_token_12345";
    const digest1 = hashInvitationToken(rawToken);
    const digest2 = hashInvitationToken(rawToken);

    expect(digest1).toHaveLength(64); // 256 bits = 64 hex characters
    expect(digest1).toEqual(digest2);
    expect(digest1).not.toEqual(rawToken);
  });

  it("createProviderWithOwner calls the atomic Provider and Service Modes RPC with all initial fields", async () => {
    const mockClient = createMockSupabase({
      rpcData: [
        {
          provider_id: "prov-123",
          membership_id: "mem-123",
          slug: "apex-repairs",
        },
      ],
    });

    const result = await createProviderWithOwner(mockClient, {
      displayName: "Apex Repairs",
      providerType: "SHOP",
      ownerDisplayName: "Maria Santos",
      ownerContactPhone: "+63 912 345 6789",
      description: "Repairs phones and computers",
      publicAddress: "123 Tech St",
      serviceArea: "Cebu",
      supportedDevices: ["Smartphones"],
      serviceModes: [
        { mode: "DROP_OFF" },
        { mode: "OTHER", details: "Courier collection" },
      ],
      acceptingRequests: true,
    });

    expect(result).toEqual({
      providerId: "prov-123",
      membershipId: "mem-123",
      slug: "apex-repairs",
    });
    expect(mockClient.rpc).toHaveBeenCalledWith(
      "create_provider_with_owner_and_modes",
      {
        p_display_name: "Apex Repairs",
        p_provider_type: "SHOP",
        p_owner_display_name: "Maria Santos",
        p_owner_contact_phone: "+63 912 345 6789",
        p_description: "Repairs phones and computers",
        p_contact_email: null,
        p_contact_phone: null,
        p_public_address: "123 Tech St",
        p_service_area: "Cebu",
        p_supported_devices: ["Smartphones"],
        p_service_modes: [
          { mode: "DROP_OFF" },
          { mode: "OTHER", details: "Courier collection" },
        ],
        p_accepting_requests: true,
      },
    );
  });

  it("createProviderWithOwner propagates duplicate name rejection error from database", async () => {
    const mockClient = createMockSupabase({
      rpcError: new Error(
        "A provider with this name already exists. Please choose a different name.",
      ),
    });

    await expect(
      createProviderWithOwner(mockClient, {
        displayName: "Duplicate Tech Shop",
        providerType: "SHOP",
        ownerDisplayName: "Maria Santos",
      }),
    ).rejects.toThrow(
      /A provider with this name already exists. Please choose a different name./,
    );
  });

  it("acceptStaffInvitation calls accept_staff_invitation RPC with token digest", async () => {
    const mockClient = createMockSupabase({
      rpcData: [
        {
          provider_id: "prov-shop-123",
          membership_id: "mem-staff-123",
          role: "STAFF",
        },
      ],
    });

    const result = await acceptStaffInvitationPersistence(
      mockClient,
      "sha256_token_hash_value",
      "Carlos Gomez",
      "+63 911 222 3333",
    );

    expect(result).toEqual({
      providerId: "prov-shop-123",
      membershipId: "mem-staff-123",
      role: "STAFF",
    });
    expect(mockClient.rpc).toHaveBeenCalledWith("accept_staff_invitation", {
      p_token_hash: "sha256_token_hash_value",
      p_display_name: "Carlos Gomez",
      p_contact_phone: "+63 911 222 3333",
    });
  });

  it("insertStaffInvitationRecord calls create_staff_invitation RPC and reports whether it reused an active invite", async () => {
    const mockClient = createMockSupabase({});
    const { invitation, reused } = await insertStaffInvitationRecord(
      mockClient,
      {
        providerId: "prov-123",
        invitedByUserId: "user-owner",
        email: "tech@shop.com",
        tokenHash:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      },
    );

    expect(invitation.email).toBe("tech@shop.com");
    expect(invitation.id).toBe("inv-new-123");
    expect(reused).toBe(false);
    expect(mockClient.rpc).toHaveBeenCalledWith("create_staff_invitation", {
      p_email: "tech@shop.com",
      p_token_hash:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    });
  });

  it("insertStaffInvitationRecord maps a reused active invite without a new row", async () => {
    const mockClient = createMockSupabase({
      rpcData: [
        {
          invitation_id: "inv-existing-1",
          provider_id: "prov-123",
          email: "tech@shop.com",
          role: "STAFF",
          created_at: "2026-08-20T00:00:00Z",
          expires_at: "2026-08-27T00:00:00Z",
          reused: true,
        },
      ],
    });

    const { invitation, reused } = await insertStaffInvitationRecord(
      mockClient,
      {
        providerId: "prov-123",
        invitedByUserId: "user-owner",
        email: "tech@shop.com",
        tokenHash:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      },
    );

    expect(reused).toBe(true);
    expect(invitation.id).toBe("inv-existing-1");
    expect(invitation.email).toBe("tech@shop.com");
  });

  it("listTeamMembers combines provider_memberships and canonical provider_user_profiles", async () => {
    const mockClient = createMockSupabase({});
    const members = await listTeamMembers(mockClient, "prov-123");

    expect(members).toHaveLength(1);
    expect(members[0].displayName).toBe("Maria Santos");
    expect(members[0].contactPhone).toBe("+63 912 345 6789");
    expect(members[0].role).toBe("OWNER");
  });

  it("getPublicProviderProfile selects from public_provider_profiles view", async () => {
    const mockClient = createMockSupabase({});
    const profile = await getPublicProviderProfile(
      mockClient,
      "apex-electronics",
    );

    expect(profile).not.toBeNull();
    expect(profile?.displayName).toBe("Apex Electronics");
    expect(profile?.acceptingRequests).toBe(true);
    expect(profile?.serviceModes).toEqual([
      { mode: "DROP_OFF", details: null },
      { mode: "HOME_SERVICE", details: null },
    ]);
  });

  it("removeStaffMemberRecord calls remove_staff_member RPC and reports removal", async () => {
    const mockClient = createMockSupabase({});

    await expect(
      realRemoveStaffMemberRecord(
        mockClient,
        "0b8f6d0e-7c1a-4a5e-9a2b-3c4d5e6f7a8b",
      ),
    ).resolves.toBe(true);

    expect(mockClient.rpc).toHaveBeenCalledWith("remove_staff_member", {
      p_membership_id: "0b8f6d0e-7c1a-4a5e-9a2b-3c4d5e6f7a8b",
    });
  });

  it("removeStaffMemberRecord reports a neutral false for not-found or non-STAFF targets", async () => {
    const mockClient = createMockSupabase({ rpcData: false });

    await expect(
      realRemoveStaffMemberRecord(
        mockClient,
        "0b8f6d0e-7c1a-4a5e-9a2b-3c4d5e6f7a8b",
      ),
    ).resolves.toBe(false);
  });
});

describe("Providers Module — removeStaffMember feature interface", () => {
  beforeEach(() => {
    mockRequireProviderRole.mockReset();
    mockRemoveStaffMemberRecord.mockReset();
  });

  it("authorized OWNER reaches persistence and reports removal", async () => {
    mockRequireProviderRole.mockResolvedValue(ownerContext());
    mockRemoveStaffMemberRecord.mockResolvedValue(true);

    const client = {} as SupabaseClient;
    await expect(removeStaffMember({ membershipId }, client)).resolves.toEqual({
      removed: true,
    });

    expect(mockRemoveStaffMemberRecord).toHaveBeenCalledWith(
      client,
      membershipId,
    );
  });

  it("rejects non-OWNER callers before persistence", async () => {
    mockRequireProviderRole.mockRejectedValue(
      new Error("UNAUTHORIZED_ROLE: OWNER role is required"),
    );

    await expect(removeStaffMember({ membershipId })).rejects.toThrow(
      /UNAUTHORIZED_ROLE/,
    );
    expect(mockRemoveStaffMemberRecord).not.toHaveBeenCalled();
  });

  it("rejects an invalid membership identifier before persistence", async () => {
    mockRequireProviderRole.mockResolvedValue(ownerContext());

    await expect(
      removeStaffMember({ membershipId: "not-a-uuid" }),
    ).rejects.toThrow(/Invalid team member identifier/);
    expect(mockRemoveStaffMemberRecord).not.toHaveBeenCalled();
  });

  it("preserves the neutral false result for ineligible targets", async () => {
    mockRequireProviderRole.mockResolvedValue(ownerContext());
    mockRemoveStaffMemberRecord.mockResolvedValue(false);

    await expect(removeStaffMember({ membershipId })).resolves.toEqual({
      removed: false,
    });
  });
});

describe("Providers Module — createStaffInvitation duplicate policy", () => {
  beforeEach(() => {
    mockRequireProviderRole.mockReset();
    mockSendStaffInviteEmail.mockReset();
  });

  it("reuses an existing active pending invite without issuing a credential or email", async () => {
    mockRequireProviderRole.mockResolvedValue(ownerContext());
    const mockClient = createMockSupabase({
      rpcData: [
        {
          invitation_id: "inv-existing-1",
          provider_id: "prov-shop-1",
          email: "tech@shop.com",
          role: "STAFF",
          created_at: "2026-08-20T00:00:00Z",
          expires_at: "2026-08-27T00:00:00Z",
          reused: true,
        },
      ],
    });

    const result = await createStaffInvitation(
      { email: "tech@shop.com" },
      mockClient,
    );

    expect(result.kind).toBe("reused");
    if (result.kind === "reused") {
      expect(result.invitation.id).toBe("inv-existing-1");
    }
    expect(mockSendStaffInviteEmail).not.toHaveBeenCalled();
  });

  it("creates a new invitation and emails a fresh credential when none is active", async () => {
    mockRequireProviderRole.mockResolvedValue(ownerContext());
    mockSendStaffInviteEmail.mockResolvedValue({ success: true });
    const mockClient = createMockSupabase({});

    const result = await createStaffInvitation(
      { email: "tech@shop.com" },
      mockClient,
    );

    expect(result.kind).toBe("created");
    if (result.kind === "created") {
      expect(result.rawToken).toMatch(/^inv_[a-f0-9]{48}$/);
      expect(result.inviteUrl).toBe(`/register?invite=${result.rawToken}`);
      expect(result.emailDeliverySuccess).toBe(true);
    }
    expect(mockSendStaffInviteEmail).toHaveBeenCalledTimes(1);
    expect(mockSendStaffInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "tech@shop.com" }),
    );
  });

  it("reports emailDeliverySuccess: false when email delivery fails", async () => {
    mockRequireProviderRole.mockResolvedValue(ownerContext());
    mockSendStaffInviteEmail.mockResolvedValue({
      success: false,
      reason: "provider_error",
    });
    const mockClient = createMockSupabase({});

    const result = await createStaffInvitation(
      { email: "tech@shop.com" },
      mockClient,
    );

    expect(result.kind).toBe("created");
    if (result.kind === "created") {
      expect(result.emailDeliverySuccess).toBe(false);
    }
  });

  it("preserves a failed-delivery invitation and reuses it on retry without another email", async () => {
    mockRequireProviderRole.mockResolvedValue(ownerContext());
    mockSendStaffInviteEmail.mockResolvedValue({
      success: false,
      reason: "provider_error",
    });
    const mockClient = createMockSupabase({
      rpcDataSequence: [
        [
          {
            invitation_id: "inv-preserved-1",
            provider_id: "prov-shop-1",
            email: "tech@shop.com",
            role: "STAFF",
            created_at: "2026-08-20T00:00:00Z",
            expires_at: "2026-08-27T00:00:00Z",
            reused: false,
          },
        ],
        [
          {
            invitation_id: "inv-preserved-1",
            provider_id: "prov-shop-1",
            email: "tech@shop.com",
            role: "STAFF",
            created_at: "2026-08-20T00:00:00Z",
            expires_at: "2026-08-27T00:00:00Z",
            reused: true,
          },
        ],
      ],
    });
    const rpc = vi.mocked(mockClient.rpc);

    const first = await createStaffInvitation(
      { email: "tech@shop.com" },
      mockClient,
    );
    const retry = await createStaffInvitation(
      { email: "tech@shop.com" },
      mockClient,
    );

    expect(first).toMatchObject({
      kind: "created",
      invitation: { id: "inv-preserved-1" },
      emailDeliverySuccess: false,
    });
    expect(retry).toEqual(
      expect.objectContaining({
        kind: "reused",
        invitation: expect.objectContaining({ id: "inv-preserved-1" }),
      }),
    );
    expect(mockSendStaffInviteEmail).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("translates invitation persistence failures while retaining the diagnostic cause", async () => {
    const sentinel = "SUPABASE_INTERNAL_SENTINEL_7a4c";
    mockRequireProviderRole.mockResolvedValue(ownerContext());
    const mockClient = createMockSupabase({
      rpcError: new Error(sentinel),
    });

    const promise = createStaffInvitation(
      { email: "tech@shop.com" },
      mockClient,
    );

    await expect(promise).rejects.toMatchObject({
      name: "StaffInvitationError",
      code: "TEMPORARY_FAILURE",
      message:
        "Staff invitations are temporarily unavailable. Please try again later.",
    });
    await expect(promise).rejects.toBeInstanceOf(StaffInvitationError);
    await expect(promise).rejects.not.toThrow(sentinel);

    try {
      await promise;
    } catch (error) {
      expect((error as StaffInvitationError).cause).toEqual(
        expect.objectContaining({ message: expect.stringContaining(sentinel) }),
      );
    }
    expect(mockSendStaffInviteEmail).not.toHaveBeenCalled();
  });

  it("rejects non-OWNER callers before persistence", async () => {
    mockRequireProviderRole.mockRejectedValue(
      new Error("UNAUTHORIZED_ROLE: OWNER role is required"),
    );

    await expect(
      createStaffInvitation({ email: "tech@shop.com" }),
    ).rejects.toThrow(/UNAUTHORIZED_ROLE/);
    expect(mockSendStaffInviteEmail).not.toHaveBeenCalled();
  });
});
