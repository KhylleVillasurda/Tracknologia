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

describe("Auth Module - Context & Authorization", () => {
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

  it("requireUser returns authenticated user", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-456", email: "auth@example.com" },
    });

    const user = await requireUser(mockClient);
    expect(user.id).toBe("user-456");
    expect(user.email).toBe("auth@example.com");
  });

  it("requireUser throws UNAUTHENTICATED when unauthenticated", async () => {
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
        message: "Service Unavailable",
        status: 503,
      },
    });

    const promise = requireUser(mockClient);
    await expect(promise).rejects.toBeInstanceOf(AuthError);
    await expect(promise).rejects.toMatchObject({
      code: "INFRASTRUCTURE_FAILURE",
      name: "AuthError",
    });
  });

  it("requireProviderContext returns valid ProviderContext for single membership", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-owner", email: "owner@shop.com" },
      membership: {
        id: "mem-1",
        provider_id: "prov-1",
        user_id: "user-owner",
        role: "OWNER",
        created_at: new Date().toISOString(),
        providers: {
          display_name: "Apex Electronics",
          provider_type: "SHOP",
        },
      },
    });

    const context = await requireProviderContext(mockClient);
    expect(context).toEqual({
      userId: "user-owner",
      providerId: "prov-1",
      providerName: "Apex Electronics",
      providerType: "SHOP",
      role: "OWNER",
      email: "owner@shop.com",
    });
  });

  it("requireProviderContext throws NO_MEMBERSHIP when user has no provider memberships", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-no-shop", email: "lonely@example.com" },
      membership: null,
    });

    const promise = requireProviderContext(mockClient);
    await expect(promise).rejects.toBeInstanceOf(AuthError);
    await expect(promise).rejects.toMatchObject({
      code: "NO_MEMBERSHIP",
      name: "AuthError",
    });
  });

  it("requireProviderContext throws AMBIGUOUS_PROVIDER_CONTEXT when user has multiple memberships", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-multi", email: "multi@example.com" },
      memberships: [
        {
          id: "mem-1",
          provider_id: "prov-1",
          user_id: "user-multi",
          role: "OWNER",
          created_at: new Date().toISOString(),
        },
        {
          id: "mem-2",
          provider_id: "prov-2",
          user_id: "user-multi",
          role: "STAFF",
          created_at: new Date().toISOString(),
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
      user: { id: "user-db-fail", email: "db@example.com" },
      queryError: { message: "Database connection failed", code: "08006" },
    });

    const promise = requireProviderContext(mockClient);
    await expect(promise).rejects.toBeInstanceOf(AuthError);
    await expect(promise).rejects.toMatchObject({
      code: "INFRASTRUCTURE_FAILURE",
      name: "AuthError",
    });
  });

  it("requireProviderRole allows authorized role", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-owner", email: "owner@shop.com" },
      membership: {
        id: "mem-1",
        provider_id: "prov-1",
        user_id: "user-owner",
        role: "OWNER",
        created_at: new Date().toISOString(),
      },
    });

    const context = await requireProviderRole(["OWNER"], mockClient);
    expect(context.role).toBe("OWNER");
  });

  it("requireProviderRole throws UNAUTHORIZED_ROLE when role is not allowed", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-staff", email: "staff@shop.com" },
      membership: {
        id: "mem-2",
        provider_id: "prov-1",
        user_id: "user-staff",
        role: "STAFF",
        created_at: new Date().toISOString(),
      },
    });

    const promise = requireProviderRole(["OWNER"], mockClient);
    await expect(promise).rejects.toBeInstanceOf(AuthError);
    await expect(promise).rejects.toMatchObject({
      code: "UNAUTHORIZED_ROLE",
      name: "AuthError",
    });
  });

  it("getProviderContext returns null for unauthenticated user", async () => {
    const mockClient = createMockSupabase({ user: null });
    const context = await getProviderContext(mockClient);
    expect(context).toBeNull();
  });

  it("getProviderContext returns context for authenticated user with membership", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-123", email: "user@shop.com" },
      membership: {
        id: "mem-1",
        provider_id: "prov-1",
        user_id: "user-123",
        role: "OWNER",
        created_at: new Date().toISOString(),
        providers: {
          display_name: "Apex Electronics",
          provider_type: "SHOP",
        },
      },
    });

    const context = await getProviderContext(mockClient);
    expect(context).toEqual({
      userId: "user-123",
      providerId: "prov-1",
      providerName: "Apex Electronics",
      providerType: "SHOP",
      role: "OWNER",
      email: "user@shop.com",
    });
  });

  it("getProviderContext throws INFRASTRUCTURE_FAILURE when membership query fails", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-123", email: "user@shop.com" },
      queryError: { message: "Postgres timeout", code: "57014" },
    });

    const promise = getProviderContext(mockClient);
    await expect(promise).rejects.toBeInstanceOf(AuthError);
    await expect(promise).rejects.toMatchObject({
      code: "INFRASTRUCTURE_FAILURE",
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

describe("Auth Module - Persistence Membership Queries", () => {
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

describe("Auth Module - Error Classification Helpers", () => {
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
        name: "AuthApiError",
        code: "session_not_found",
        status: 401,
      }),
    ).toBe(true);

    expect(
      isUnauthenticatedAuthError({
        name: "AuthApiError",
        code: "bad_jwt",
        status: 401,
      }),
    ).toBe(true);

    expect(
      isUnauthenticatedAuthError({
        code: "invalid_jwt",
      }),
    ).toBe(true);

    expect(
      isUnauthenticatedAuthError({
        code: "refresh_token_not_found",
      }),
    ).toBe(true);

    expect(
      isUnauthenticatedAuthError({
        code: "refresh_token_already_used",
      }),
    ).toBe(true);

    expect(
      isUnauthenticatedAuthError({
        code: "invalid_refresh_token",
      }),
    ).toBe(true);

    expect(
      isUnauthenticatedAuthError({
        code: "token_expired",
      }),
    ).toBe(true);

    expect(
      isUnauthenticatedAuthError({
        code: "session_expired",
      }),
    ).toBe(true);
  });

  it("correctly classifies unknown/degraded AuthApiError 401s as NOT unauthenticated", () => {
    // AuthApiError with unexpected_failure code and 401 status
    expect(
      isUnauthenticatedAuthError({
        name: "AuthApiError",
        code: "unexpected_failure",
        status: 401,
      }),
    ).toBe(false);

    // AuthApiError with request_timeout code and 401 status
    expect(
      isUnauthenticatedAuthError({
        name: "AuthApiError",
        code: "request_timeout",
        status: 401,
      }),
    ).toBe(false);

    // AuthApiError with unknown code and 401 status
    expect(
      isUnauthenticatedAuthError({
        name: "AuthApiError",
        code: "unknown_code",
        status: 401,
      }),
    ).toBe(false);

    // AuthApiError with bad_oauth_callback and 401 status
    expect(
      isUnauthenticatedAuthError({
        name: "AuthApiError",
        code: "bad_oauth_callback",
        status: 401,
      }),
    ).toBe(false);

    // Generic 401 without known code
    expect(
      isUnauthenticatedAuthError({
        status: 401,
        message: "Unauthorized",
      }),
    ).toBe(false);
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

describe("Auth - Validation Schemas & Registration Secrets", () => {
  it("validates login inputs correctly", () => {
    const valid = loginSchema.safeParse({
      email: "test@example.com",
      password: "securepassword",
    });
    expect(valid.success).toBe(true);

    const invalidEmail = loginSchema.safeParse({
      email: "invalid-email",
      password: "securepassword",
    });
    expect(invalidEmail.success).toBe(false);
  });

  it("validates registration inputs correctly", () => {
    const valid = registerSchema.safeParse({
      email: "owner@shop.com",
      password: "password123",
      confirmPassword: "password123",
      intent: "SHOP",
    });
    expect(valid.success).toBe(true);

    const invalidShortPassword = registerSchema.safeParse({
      email: "owner@shop.com",
      password: "123",
      confirmPassword: "123",
      intent: "SHOP",
    });
    expect(invalidShortPassword.success).toBe(false);
  });

  it("validates forgot password input correctly", () => {
    const valid = forgotPasswordSchema.safeParse({
      email: "user@example.com",
    });
    expect(valid.success).toBe(true);

    const invalid = forgotPasswordSchema.safeParse({
      email: "not-an-email",
    });
    expect(invalid.success).toBe(false);
  });
});
