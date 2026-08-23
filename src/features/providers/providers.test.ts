import { describe, expect, it, vi } from "vitest";

// Mock server-only in test environment
vi.mock("server-only", () => ({}));

import {
  createIndependentProviderSchema,
  createShopProviderSchema,
  staffInvitationSchema,
  acceptStaffInvitationSchema,
  providerServiceModesSchema,
} from "./schemas";
import {
  hashInvitationToken,
  createProviderWithOwner,
  acceptStaffInvitation as acceptStaffInvitationPersistence,
  insertStaffInvitationRecord,
  listTeamMembers,
  getPublicProviderProfile,
} from "./persistence";
import type { SupabaseClient } from "@supabase/supabase-js";

function createMockSupabase(options: {
  rpcData?: unknown;
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
          data: options.rpcData ?? [
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

  it("insertStaffInvitationRecord calls create_staff_invitation RPC with parameters", async () => {
    const mockClient = createMockSupabase({});
    const invitation = await insertStaffInvitationRecord(mockClient, {
      providerId: "prov-123",
      invitedByUserId: "user-owner",
      email: "tech@shop.com",
      tokenHash:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    });

    expect(invitation.email).toBe("tech@shop.com");
    expect(mockClient.rpc).toHaveBeenCalledWith("create_staff_invitation", {
      p_email: "tech@shop.com",
      p_token_hash:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    });
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
});
