import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findMembershipByUserId } from "./persistence";
import {
  AuthError,
  isUnauthenticatedAuthError,
  type AuthenticatedUser,
  type ProviderContext,
  type ProviderRole,
} from "./types";

async function resolveUserFromSupabase(
  supabase: SupabaseClient,
): Promise<AuthenticatedUser | null> {
  let result;
  try {
    result = await supabase.auth.getUser();
  } catch (err) {
    console.error("[AUTH_INFRASTRUCTURE_FAILURE] getUser threw exception", {
      message: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
    throw new AuthError(
      "Authentication service unavailable",
      "INFRASTRUCTURE_FAILURE",
      err,
    );
  }

  const {
    data: { user },
    error,
  } = result;

  if (error) {
    if (isUnauthenticatedAuthError(error)) {
      return null;
    }
    console.error("[AUTH_INFRASTRUCTURE_FAILURE] getUser returned error", {
      message: error.message,
      status: (error as { status?: number }).status,
      name: error.name,
      timestamp: new Date().toISOString(),
    });
    throw new AuthError(
      "Authentication service unavailable",
      "INFRASTRUCTURE_FAILURE",
      error,
    );
  }

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? null,
    userMetadata: user.user_metadata,
  };
}

async function resolveProviderContextInternal(
  supabase: SupabaseClient,
  user: AuthenticatedUser | null,
): Promise<ProviderContext | null> {
  if (!user) {
    return null;
  }

  const membership = await findMembershipByUserId(supabase, user.id);
  if (!membership) {
    return null;
  }

  return {
    userId: user.id,
    providerId: membership.providerId,
    providerName: membership.providerName,
    providerType: membership.providerType,
    role: membership.role,
    email: user.email,
  };
}

// Request-scoped memoized resolvers for the default server request lifecycle
const getRequestScopedUser = cache(
  async (): Promise<AuthenticatedUser | null> => {
    const supabase = await createClient();
    return resolveUserFromSupabase(supabase);
  },
);

const getRequestScopedProviderContext = cache(
  async (): Promise<ProviderContext | null> => {
    const supabase = await createClient();
    const user = await getRequestScopedUser();
    return resolveProviderContextInternal(supabase, user);
  },
);

export async function getUser(
  client?: SupabaseClient,
): Promise<AuthenticatedUser | null> {
  if (client) {
    return resolveUserFromSupabase(client);
  }
  return getRequestScopedUser();
}

export async function requireUser(
  client?: SupabaseClient,
): Promise<AuthenticatedUser> {
  const user = await getUser(client);
  if (!user) {
    throw new AuthError("Authentication required", "UNAUTHENTICATED");
  }
  return user;
}

export async function getProviderContext(
  client?: SupabaseClient,
): Promise<ProviderContext | null> {
  if (client) {
    const user = await resolveUserFromSupabase(client);
    return resolveProviderContextInternal(client, user);
  }
  return getRequestScopedProviderContext();
}

/**
 * Resolves the trusted ProviderContext for the authenticated user.
 * FAILS CLOSED: Throws AuthError('NO_MEMBERSHIP') if the user has no active Provider membership.
 * Throws AuthError('UNAUTHENTICATED') if the user is unauthenticated.
 * Throws AuthError('AMBIGUOUS_PROVIDER_CONTEXT') if multiple memberships exist.
 * Throws AuthError('INFRASTRUCTURE_FAILURE') if authentication or database query fails.
 */
export async function requireProviderContext(
  client?: SupabaseClient,
): Promise<ProviderContext> {
  const user = await requireUser(client);

  if (client) {
    const membership = await findMembershipByUserId(client, user.id);
    if (!membership) {
      throw new AuthError(
        "No provider membership found for user",
        "NO_MEMBERSHIP",
      );
    }
    return {
      userId: user.id,
      providerId: membership.providerId,
      providerName: membership.providerName,
      providerType: membership.providerType,
      role: membership.role,
      email: user.email,
    };
  }

  const context = await getRequestScopedProviderContext();
  if (!context) {
    throw new AuthError(
      "No provider membership found for user",
      "NO_MEMBERSHIP",
    );
  }

  return context;
}

export async function requireProviderRole(
  allowedRoles: ProviderRole[],
  client?: SupabaseClient,
): Promise<ProviderContext> {
  const context = await requireProviderContext(client);

  if (!allowedRoles.includes(context.role)) {
    throw new AuthError(
      `User role '${context.role}' is not authorized. Required: ${allowedRoles.join(", ")}`,
      "UNAUTHORIZED_ROLE",
    );
  }

  return context;
}
