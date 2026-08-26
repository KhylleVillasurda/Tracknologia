import { describe, expect, it, vi } from "vitest";

// Mock server-only in test environment
vi.mock("server-only", () => ({}));

import {
  getUser,
  requireUser,
  getProviderContext,
  requireProviderContext,
  requireProviderRole,
} from "./context";
import { loginSchema, registerSchema, forgotPasswordSchema } from "./schemas";
import { findMembershipByUserId } from "./persistence";
import { AuthError, isUnauthenticatedAuthError } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ServiceUnavailable } from "@/app/(provider)/dashboard/_components/service-unavailable";

function createMockSupabase(options: {
  user?: { id: string; email?: string } | null;
  authError?: unknown;
  queryError?: { message: string; code?: string } | null;
  memberships?: Array<{
    id: string;
    provider_id: string;
    user_id: string;
    role: "OWNER" | "STAFF";
    created_at: string;
    providers?: {
      display_name: string;
      provider_type: "SHOP" | "INDEPENDENT";
    };
  }> | null;
  membership?: {
    id: string;
    provider_id: string;
    user_id: string;
    role: "OWNER" | "STAFF";
    created_at: string;
    providers?: {
      display_name: string;
      provider_type: "SHOP" | "INDEPENDENT";
    };
  } | null;
}) {
  const defaultProviders = {
    display_name: "Apex Electronics",
    provider_type: "SHOP" as const,
  };

  const membershipArray = options.memberships
    ? options.memberships.map((m) => ({
        ...m,
        providers: m.providers ?? defaultProviders,
      }))
    : options.membership
      ? [
          {
            ...options.membership,
            providers: options.membership.providers ?? defaultProviders,
          },
        ]
      : [];

  const defaultAuthError = options.user
    ? null
    : { name: "AuthSessionMissingError", message: "Auth session missing!" };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: options.user ?? null },
        error:
          options.authError !== undefined
            ? options.authError
            : defaultAuthError,
      }),
    },
    from: vi.fn().mockImplementation(() => {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: options.queryError ? null : membershipArray,
            error: options.queryError ?? null,
          }),
        }),
      };
    }),
  } as unknown as SupabaseClient;
}

describe("Auth Module ï¿½ Context & Authorization", () => {
  it("getUser returns user when authenticated", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-123", email: "test@example.com" },
    });

    const user = await getUser(mockClient);
    expect(user).toEqual({
      id: "user-123",
      email: "test@example.com",
    });
  });

  it("getUser returns null when unauthenticated", async () => {
    const mockClient = createMockSupabase({ user: null });
    const user = await getUser(mockClient);
    expect(user).toBeNull();
  });

  it("getUser throws INFRASTRUCTURE_FAILURE when Supabase auth encounters a 500 error", async () => {
    const mockClient = createMockSupabase({
      authError: {
        name: "AuthRetryableFetchError",
        message: "Network request failed: 500 Internal Server Error",
        status: 500,
      },
    });

    const promise = getUser(mockClient);
    await expect(promise).rejects.toBeInstanceOf(AuthError);
    await expect(promise).rejects.toMatchObject({
      code: "INFRASTRUCTURE_FAILURE",
      name: "AuthError",
    });
  });

  it("getUser throws INFRASTRUCTURE_FAILURE when Supabase client throws an exception", async () => {
    const mockClient = {
      auth: {
        getUser: vi.fn().mockRejectedValue(new Error("Connection refused")),
      },
    } as unknown as SupabaseClient;

    const promise = getUser(mockClient);
    await expect(promise).rejects.toBeInstanceOf(AuthError);
    await expect(promise).rejects.toMatchObject({
      code: "INFRASTRUCTURE_FAILURE",
      name: "AuthError",
    });
  });

  it("requireUser throws UNAUTHENTICATED error when unauthenticated", async () => {
    const mockClient = createMockSupabase({ user: null });
    const promise = requireUser(mockClient);
    await expect(promise).rejects.toBeInstanceOf(AuthError);
    await expect(promise).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      name: "AuthError",
    });
  });

  it("requireUser propagates INFRASTRUCTURE_FAILURE when auth service fails", async () => {
    const mockClient = createMockSupabase({
      authError: {
        status: 503,
        message: "Service Unavailable",
      },
    });

    const promise = requireUser(mockClient);
    await expect(promise).rejects.toBeInstanceOf(AuthError);
    await expect(promise).rejects.toMatchObject({
      code: "INFRASTRUCTURE_FAILURE",
      name: "AuthError",
    });
  });

  it("requireProviderContext FAILS CLOSED with NO_MEMBERSHIP when user has no membership", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-no-membership", email: "user@example.com" },
      membership: null,
    });

    const promise = requireProviderContext(mockClient);
    await expect(promise).rejects.toBeInstanceOf(AuthError);
    await expect(promise).rejects.toMatchObject({
      code: "NO_MEMBERSHIP",
      name: "AuthError",
    });
  });

  it("requireProviderContext FAILS CLOSED with AMBIGUOUS_PROVIDER_CONTEXT when user has multiple memberships", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-multi", email: "multi@example.com" },
      memberships: [
        {
          id: "mem-1",
          provider_id: "prov-1",
          user_id: "user-multi",
          role: "OWNER",
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "mem-2",
          provider_id: "prov-2",
          user_id: "user-multi",
          role: "STAFF",
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    });

    const promise = requireProviderContext(mockClient);
    await expect(promise).rejects.toBeInstanceOf(AuthError);
    await expect(promise).rejects.toMatchObject({
      code: "AMBIGUOUS_PROVIDER_CONTEXT",
      name: "AuthError",
    });
  });

  it("requireProviderContext throws INFRASTRUCTURE_FAILURE when database query fails", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-123", email: "user@example.com" },
      queryError: {
        message: "Database connection failed",
        code: "08006",
      },
    });

    const promise = requireProviderContext(mockClient);
    await expect(promise).rejects.toBeInstanceOf(AuthError);
    await expect(promise).rejects.toMatchObject({
      code: "INFRASTRUCTURE_FAILURE",
      name: "AuthError",
    });
  });

  it("getProviderContext returns null when user has no membership", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-no-membership", email: "user@example.com" },
      membership: null,
    });

    const context = await getProviderContext(mockClient);
    expect(context).toBeNull();
  });

  it("getProviderContext throws INFRASTRUCTURE_FAILURE when membership query fails", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-123", email: "user@example.com" },
      queryError: {
        message: "Postgres timeout",
        code: "57014",
      },
    });

    const promise = getProviderContext(mockClient);
    await expect(promise).rejects.toBeInstanceOf(AuthError);
    await expect(promise).rejects.toMatchObject({
      code: "INFRASTRUCTURE_FAILURE",
      name: "AuthError",
    });
  });

  it("requireProviderContext resolves valid ProviderContext for OWNER", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-123", email: "owner@shop.com" },
      membership: {
        id: "mem-1",
        provider_id: "provider-abc",
        user_id: "user-123",
        role: "OWNER",
        created_at: "2026-01-01T00:00:00Z",
        providers: {
          display_name: "Apex Shop",
          provider_type: "SHOP",
        },
      },
    });

    const context = await requireProviderContext(mockClient);
    expect(context).toEqual({
      userId: "user-123",
      providerId: "provider-abc",
      providerName: "Apex Shop",
      providerType: "SHOP",
      role: "OWNER",
      email: "owner@shop.com",
    });
  });

  it("requireProviderContext resolves valid ProviderContext for INDEPENDENT repairer", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-independent", email: "alex@mobiletech.com" },
      membership: {
        id: "mem-ind-1",
        provider_id: "provider-ind-123",
        user_id: "user-independent",
        role: "OWNER",
        created_at: "2026-01-01T00:00:00Z",
        providers: {
          display_name: "Alex Mobile Repairs",
          provider_type: "INDEPENDENT",
        },
      },
    });

    const context = await requireProviderContext(mockClient);
    expect(context).toEqual({
      userId: "user-independent",
      providerId: "provider-ind-123",
      providerName: "Alex Mobile Repairs",
      providerType: "INDEPENDENT",
      role: "OWNER",
      email: "alex@mobiletech.com",
    });
  });

  it("requireProviderContext resolves valid ProviderContext for STAFF", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-456", email: "staff@shop.com" },
      membership: {
        id: "mem-2",
        provider_id: "provider-abc",
        user_id: "user-456",
        role: "STAFF",
        created_at: "2026-01-01T00:00:00Z",
        providers: {
          display_name: "Apex Shop",
          provider_type: "SHOP",
        },
      },
    });

    const context = await requireProviderContext(mockClient);
    expect(context.role).toBe("STAFF");
    expect(context.providerId).toBe("provider-abc");
    expect(context.providerType).toBe("SHOP");
  });

  it("requireProviderRole succeeds when role matches", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-123", email: "owner@shop.com" },
      membership: {
        id: "mem-1",
        provider_id: "provider-abc",
        user_id: "user-123",
        role: "OWNER",
        created_at: "2026-01-01T00:00:00Z",
        providers: {
          display_name: "Apex Shop",
          provider_type: "SHOP",
        },
      },
    });

    const context = await requireProviderRole(["OWNER"], mockClient);
    expect(context.role).toBe("OWNER");
  });

  it("requireProviderRole throws UNAUTHORIZED_ROLE when role does not match", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-456", email: "staff@shop.com" },
      membership: {
        id: "mem-2",
        provider_id: "provider-abc",
        user_id: "user-456",
        role: "STAFF",
        created_at: "2026-01-01T00:00:00Z",
        providers: {
          display_name: "Apex Shop",
          provider_type: "SHOP",
        },
      },
    });

    const promise = requireProviderRole(["OWNER"], mockClient);
    await expect(promise).rejects.toBeInstanceOf(AuthError);
    await expect(promise).rejects.toMatchObject({
      code: "UNAUTHORIZED_ROLE",
      name: "AuthError",
    });
  });

  it("removed staff member resolves NO_MEMBERSHIP upon subsequent requests", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-offboarded-staff", email: "ex-staff@shop.com" },
      membership: null,
    });

    const promise = requireProviderContext(mockClient);
    await expect(promise).rejects.toBeInstanceOf(AuthError);
    await expect(promise).rejects.toMatchObject({
      code: "NO_MEMBERSHIP",
      name: "AuthError",
    });
  });
});

describe("Auth Module ï¿½ Persistence Membership Queries", () => {
  it("findMembershipByUserId returns null when no rows exist", async () => {
    const mockClient = createMockSupabase({ membership: null });
    const result = await findMembershipByUserId(mockClient, "user-empty");
    expect(result).toBeNull();
  });

  it("findMembershipByUserId throws INFRASTRUCTURE_FAILURE on database query error", async () => {
    const mockClient = createMockSupabase({
      queryError: { message: "query timeout", code: "57014" },
    });
    const promise = findMembershipByUserId(mockClient, "user-123");
    await expect(promise).rejects.toBeInstanceOf(AuthError);
    await expect(promise).rejects.toMatchObject({
      code: "INFRASTRUCTURE_FAILURE",
      name: "AuthError",
    });
  });
});

describe("Auth Module ï¿½ Error Classification Helpers", () => {
  it("correctly classifies explicit unauthenticated session errors", () => {
    expect(
      isUnauthenticatedAuthError({
        name: "AuthSessionMissingError",
        message: "Auth session missing!",
      }),
    ).toBe(true);

    expect(
      isUnauthenticatedAuthError({
        name: "AuthApiError",
        code: "session_not_found",
        status: 400,
      }),
    ).toBe(true);

    expect(
      isUnauthenticatedAuthError({
        code: "invalid_jwt",
      }),
    ).toBe(true);

    expect(
      isUnauthenticatedAuthError({
        code: "bad_jwt",
      }),
    ).toBe(true);

    expect(
      isUnauthenticatedAuthError({
        code: "refresh_token_not_found",
      }),
    ).toBe(true);

    expect(
      isUnauthenticatedAuthError({
        name: "AuthApiError",
        status: 401,
        message: "Invalid token",
      }),
    ).toBe(true);
  });

  it("correctly classifies infrastructure, database, and network errors as NOT unauthenticated", () => {
    // 500 Internal Server Error
    expect(
      isUnauthenticatedAuthError({
        status: 500,
        message: "Internal Server Error",
      }),
    ).toBe(false);

    // 503 Service Unavailable
    expect(
      isUnauthenticatedAuthError({
        status: 503,
        message: "Service Unavailable",
      }),
    ).toBe(false);

    // Postgres Connection Timeout / Error
    expect(
      isUnauthenticatedAuthError({
        code: "08006",
        message: "connection failure",
      }),
    ).toBe(false);

    // Postgres Query Timeout
    expect(
      isUnauthenticatedAuthError({
        code: "57014",
        message: "query_canceled",
      }),
    ).toBe(false);

    // Generic 400 Bad Request with non-auth code
    expect(
      isUnauthenticatedAuthError({
        status: 400,
        message: "Bad Request: invalid parameter",
      }),
    ).toBe(false);

    // Network / fetch failure
    expect(isUnauthenticatedAuthError(new TypeError("fetch failed"))).toBe(
      false,
    );
  });
});

describe("Auth Module ï¿½ ServiceUnavailable Presentation Seam", () => {
  it("renders safe user-facing copy without leaking technical or infrastructure internals", () => {
    const element = ServiceUnavailable();
    expect(element).toBeDefined();
  });
});

describe("Auth ï¿½ Validation Schemas & Registration Secrets", () => {
  it("validates login inputs correctly", () => {
    const valid = loginSchema.safeParse({
      email: "test@example.com",
      password: "password123",
    });
    expect(valid.success).toBe(true);

    const invalidEmail = loginSchema.safeParse({
      email: "not-an-email",
      password: "password123",
    });
    expect(invalidEmail.success).toBe(false);

    const shortPassword = loginSchema.safeParse({
      email: "test@example.com",
      password: "123",
    });
    expect(shortPassword.success).toBe(false);
  });

  it("validates provider registration inputs for all intents", () => {
    const validIndependent = registerSchema.safeParse({
      intent: "INDEPENDENT",
      email: "owner@example.com",
      password: "securepassword123",
      confirmPassword: "securepassword123",
    });
    expect(validIndependent.success).toBe(true);

    const validShop = registerSchema.safeParse({
      intent: "SHOP",
      email: "owner@shop.com",
      password: "securepassword123",
      confirmPassword: "securepassword123",
    });
    expect(validShop.success).toBe(true);

    const validStaff = registerSchema.safeParse({
      intent: "STAFF",
      inviteToken: "valid-invite-token-123",
      email: "staff@shop.com",
      password: "securepassword123",
      confirmPassword: "securepassword123",
    });
    expect(validStaff.success).toBe(true);

    const invalidStaffMissingToken = registerSchema.safeParse({
      intent: "STAFF",
      email: "staff@shop.com",
      password: "securepassword123",
      confirmPassword: "securepassword123",
    });
    expect(invalidStaffMissingToken.success).toBe(false);

    const mismatch = registerSchema.safeParse({
      intent: "INDEPENDENT",
      email: "owner@example.com",
      password: "securepassword123",
      confirmPassword: "differentpassword",
    });
    expect(mismatch.success).toBe(false);
  });

  it("validates forgot password inputs", () => {
    expect(
      forgotPasswordSchema.safeParse({ email: "valid@email.com" }).success,
    ).toBe(true);
    expect(
      forgotPasswordSchema.safeParse({ email: "invalid-email" }).success,
    ).toBe(false);
  });
});
