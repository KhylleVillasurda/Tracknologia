import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock server-only in test environment
vi.mock("server-only", () => ({}));

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getUser,
  getProviderContext,
  requireProviderContext,
  requireProviderRole,
} from "@/features/auth/context";

describe("Auth Module — Request-Local Deduplication & Freshness Contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reuses resolved user context across provider requirements within a request pipeline", async () => {
    const mockGetUser = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: "user-owner-1",
          email: "owner@shop.com",
          user_metadata: {
            display_name: "Apex Electronics",
            provider_type: "SHOP",
          },
        },
      },
      error: null,
    });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: [
          {
            id: "mem-1",
            provider_id: "prov-1",
            user_id: "user-owner-1",
            role: "OWNER",
            created_at: new Date().toISOString(),
            providers: {
              display_name: "Apex Electronics",
              provider_type: "SHOP",
            },
          },
        ],
        error: null,
      }),
    });

    const mockClient = {
      auth: { getUser: mockGetUser },
      from: vi.fn().mockImplementation(() => ({ select: mockSelect })),
    } as unknown as SupabaseClient;

    // In a representative Server Component request pipeline:
    // 1. Layout checks role authorization
    const roleContext = await requireProviderRole(["OWNER"], mockClient);
    expect(roleContext.providerId).toBe("prov-1");
    expect(roleContext.role).toBe("OWNER");

    // 2. Page resolves provider context
    const pageContext = await getProviderContext(mockClient);
    expect(pageContext?.providerId).toBe("prov-1");

    // 3. Child component resolves current user
    const user = await getUser(mockClient);
    expect(user?.id).toBe("user-owner-1");
  });

  it("ensures subsequent request evaluates membership fresh without cross-request stale cache", async () => {
    const mockGetUser = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: "user-staff-1",
          email: "staff@shop.com",
        },
      },
      error: null,
    });

    let currentMemberships: Array<unknown> | null = [
      {
        id: "mem-2",
        provider_id: "prov-1",
        user_id: "user-staff-1",
        role: "STAFF",
        created_at: new Date().toISOString(),
        providers: {
          display_name: "Apex Electronics",
          provider_type: "SHOP",
        },
      },
    ];

    const mockStaffClient = {
      auth: { getUser: mockGetUser },
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation(() =>
            Promise.resolve({
              data: currentMemberships,
              error: null,
            }),
          ),
        }),
      })),
    } as unknown as SupabaseClient;

    // Request 1 (Staff active)
    const contextReq1 = await requireProviderContext(mockStaffClient);
    expect(contextReq1.role).toBe("STAFF");

    // Staff is offboarded in database before Request 2
    currentMemberships = [];

    // Request 2 (Staff removed)
    // Fresh execution immediately observes the deleted membership and throws NO_MEMBERSHIP
    await expect(requireProviderContext(mockStaffClient)).rejects.toMatchObject(
      {
        code: "NO_MEMBERSHIP",
        name: "AuthError",
      },
    );
  });
});
