import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AuthError,
  type ProviderMembership,
  type ProviderRole,
  type ProviderType,
} from "./types";

interface ProviderMembershipRow {
  id: string;
  provider_id: string;
  user_id: string;
  role: ProviderRole;
  created_at: string;
  providers?: {
    display_name: string;
    provider_type: ProviderType;
  } | null;
}

export interface ProviderMembershipWithDetails extends ProviderMembership {
  providerName: string;
  providerType: ProviderType;
}

/**
 * Finds the trusted Provider membership for a given user ID.
 * Returns null if 0 memberships exist.
 * Throws AMBIGUOUS_PROVIDER_CONTEXT if > 1 memberships exist (until multi-provider selection is supported).
 * Throws INFRASTRUCTURE_FAILURE if Supabase query fails.
 */
export async function findMembershipByUserId(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProviderMembershipWithDetails | null> {
  const { data, error } = await supabase
    .from("provider_memberships")
    .select(
      "id, provider_id, user_id, role, created_at, providers!inner(display_name, provider_type)",
    )
    .eq("user_id", userId);

  if (error) {
    console.error(
      "[AUTH_INFRASTRUCTURE_FAILURE] findMembershipByUserId query error",
      {
        code: error.code,
        message: error.message,
        timestamp: new Date().toISOString(),
      },
    );
    throw new AuthError(
      "Failed to query provider membership due to infrastructure failure",
      "INFRASTRUCTURE_FAILURE",
      error,
    );
  }

  if (!data || data.length === 0) {
    return null;
  }

  if (data.length > 1) {
    throw new AuthError(
      "Multiple provider memberships found for user without active selection",
      "AMBIGUOUS_PROVIDER_CONTEXT",
    );
  }

  const row = data[0] as unknown as ProviderMembershipRow;
  const provider = row.providers;

  return {
    id: row.id,
    providerId: row.provider_id,
    userId: row.user_id,
    role: row.role,
    createdAt: row.created_at,
    providerName: provider?.display_name ?? "Provider",
    providerType: provider?.provider_type ?? "SHOP",
  };
}
