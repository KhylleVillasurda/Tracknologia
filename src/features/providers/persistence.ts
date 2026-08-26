import "server-only";
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateProviderInput,
  InvitationShopDetails,
  Provider,
  ProviderInvitation,
  ProviderServiceMode,
  ProviderType,
  ProviderUserProfile,
  PublicProviderProfile,
  TeamMember,
  UpdateProviderProfileInput,
  UpdateProviderUserProfileInput,
} from "./types";

/**
 * Generates a SHA-256 cryptographic digest of a raw token.
 * Only the digest is stored in the database; raw tokens are never persisted.
 */
export function hashInvitationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken.trim()).digest("hex");
}

export async function createProviderWithOwner(
  supabase: SupabaseClient,
  params: CreateProviderInput,
): Promise<{ providerId: string; membershipId: string; slug: string }> {
  const { data, error } = await supabase.rpc(
    "create_provider_with_owner_and_modes",
    {
      p_display_name: params.displayName,
      p_provider_type: params.providerType,
      p_owner_display_name: params.ownerDisplayName || null,
      p_owner_contact_phone: params.ownerContactPhone || null,
      p_description: params.description || null,
      p_contact_email: params.contactEmail || null,
      p_contact_phone: params.contactPhone || null,
      p_public_address: params.publicAddress || null,
      p_service_area: params.serviceArea || null,
      p_supported_devices:
        params.supportedDevices && params.supportedDevices.length > 0
          ? params.supportedDevices
          : [],
      p_service_modes: params.serviceModes ?? [],
      p_accepting_requests: params.acceptingRequests ?? true,
    },
  );

  if (error) {
    throw new Error(`Failed to create provider: ${error.message}`);
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || !result.provider_id) {
    throw new Error("Provider creation returned empty result");
  }

  return {
    providerId: result.provider_id,
    membershipId: result.membership_id,
    slug: result.slug,
  };
}

export async function acceptStaffInvitation(
  supabase: SupabaseClient,
  tokenHash: string,
  displayName: string,
  contactPhone?: string,
): Promise<{ providerId: string; membershipId: string; role: "STAFF" }> {
  const { data, error } = await supabase.rpc("accept_staff_invitation", {
    p_token_hash: tokenHash,
    p_display_name: displayName,
    p_contact_phone: contactPhone || null,
  });

  if (error) {
    throw new Error(`Failed to accept staff invitation: ${error.message}`);
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || !result.provider_id) {
    throw new Error("Staff invitation acceptance returned empty result");
  }

  return {
    providerId: result.provider_id,
    membershipId: result.membership_id,
    role: result.role,
  };
}

export async function getInvitationDetailsByTokenHash(
  supabase: SupabaseClient,
  tokenHash: string,
): Promise<InvitationShopDetails | null> {
  const { data, error } = await supabase.rpc("get_invitation_details", {
    p_token_hash: tokenHash,
  });

  if (error) {
    throw new Error(`Failed to fetch invitation details: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || !result.provider_id) {
    return null;
  }

  return {
    invitationId: result.invitation_id,
    email: result.email,
    role: result.role,
    providerId: result.provider_id,
    shopName: result.shop_name,
    publicAddress: result.public_address,
    serviceArea: result.service_area,
  };
}

export async function updateProviderProfileRecord(
  supabase: SupabaseClient,
  providerId: string,
  input: UpdateProviderProfileInput,
): Promise<Provider> {
  const { data, error } = await supabase
    .from("providers")
    .update({
      display_name: input.displayName,
      description: input.description || null,
      profile_image_url: input.profileImageUrl || null,
      contact_phone: input.contactPhone || null,
      contact_email: input.contactEmail || null,
      public_address: input.publicAddress || null,
      service_area: input.serviceArea || null,
      supported_devices: input.supportedDevices ?? [],
      accepting_requests: input.acceptingRequests,
    })
    .eq("id", providerId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update provider profile: ${error.message}`);
  }

  return mapProvider(data);
}

export async function updateProviderUserProfileRecord(
  supabase: SupabaseClient,
  userId: string,
  input: UpdateProviderUserProfileInput,
): Promise<ProviderUserProfile> {
  const { data, error } = await supabase
    .from("provider_user_profiles")
    .update({
      display_name: input.displayName,
      contact_phone: input.contactPhone || null,
      avatar_url: input.avatarUrl || null,
    })
    .eq("user_id", userId)
    .select(
      "user_id, display_name, contact_phone, avatar_url, created_at, updated_at",
    )
    .single();

  if (error) {
    throw new Error(`Failed to update user profile: ${error.message}`);
  }

  return mapProviderUserProfile(data);
}

export async function replaceProviderServiceModes(
  supabase: SupabaseClient,
  modes: ProviderServiceMode[],
): Promise<ProviderServiceMode[]> {
  const { data, error } = await supabase.rpc("set_provider_service_modes", {
    p_service_modes: modes,
  });

  if (error) {
    throw new Error(`Failed to update Service Modes: ${error.message}`);
  }

  return (data || []).map(
    (row: { mode: ProviderServiceMode["mode"]; details: string | null }) => ({
      mode: row.mode,
      details: row.details,
    }),
  );
}

export async function getProviderServiceModeRecords(
  supabase: SupabaseClient,
  providerId: string,
): Promise<ProviderServiceMode[]> {
  const { data, error } = await supabase
    .from("provider_service_modes")
    .select("mode, details")
    .eq("provider_id", providerId)
    .order("mode", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch Service Modes: ${error.message}`);
  }

  return (data || []).map((row) => ({
    mode: row.mode as ProviderServiceMode["mode"],
    details: row.details,
  }));
}

export async function insertStaffInvitationRecord(
  supabase: SupabaseClient,
  params: {
    providerId: string;
    invitedByUserId: string;
    email: string;
    tokenHash: string;
  },
): Promise<ProviderInvitation> {
  const { data, error } = await supabase.rpc("create_staff_invitation", {
    p_email: params.email,
    p_token_hash: params.tokenHash,
  });

  if (error) {
    throw new Error(`Failed to create staff invitation: ${error.message}`);
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || !result.invitation_id) {
    throw new Error("Staff invitation creation returned empty result");
  }

  return {
    id: result.invitation_id,
    providerId: result.provider_id,
    email: result.email,
    role: result.role,
    invitedByUserId: params.invitedByUserId,
    createdAt: result.created_at,
    expiresAt: result.expires_at,
    acceptedAt: null,
    acceptedByUserId: null,
    revokedAt: null,
  };
}

export async function listStaffInvitations(
  supabase: SupabaseClient,
  providerId: string,
): Promise<ProviderInvitation[]> {
  const { data, error } = await supabase
    .from("provider_invitations")
    .select(
      "id, provider_id, email, role, invited_by_user_id, created_at, expires_at, accepted_at, accepted_by_user_id, revoked_at",
    )
    .eq("provider_id", providerId)
    .is("revoked_at", null)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list staff invitations: ${error.message}`);
  }

  return (data || []).map((row) => ({
    id: row.id,
    providerId: row.provider_id,
    email: row.email,
    role: row.role,
    invitedByUserId: row.invited_by_user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    acceptedByUserId: row.accepted_by_user_id,
    revokedAt: row.revoked_at,
  }));
}

export async function listTeamMembers(
  supabase: SupabaseClient,
  providerId: string,
): Promise<TeamMember[]> {
  const { data: memberships, error: memError } = await supabase
    .from("provider_memberships")
    .select("id, provider_id, user_id, role, created_at")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: true });

  if (memError) {
    throw new Error(`Failed to list team memberships: ${memError.message}`);
  }

  if (!memberships || memberships.length === 0) {
    return [];
  }

  const userIds = memberships.map((m) => m.user_id);

  // Query canonical person profiles from provider_user_profiles (surface errors if query fails)
  const { data: profiles, error: profileError } = await supabase
    .from("provider_user_profiles")
    .select("user_id, display_name, contact_phone")
    .in("user_id", userIds);

  if (profileError) {
    throw new Error(
      `Failed to fetch team member profiles: ${profileError.message}`,
    );
  }

  const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

  return memberships.map((row) => {
    const profile = profileMap.get(row.user_id);
    return {
      membershipId: row.id,
      userId: row.user_id,
      role: row.role,
      displayName:
        profile?.display_name ||
        (row.role === "OWNER" ? "Shop Owner" : "Staff Member"),
      email: null,
      contactPhone: profile?.contact_phone || null,
      createdAt: row.created_at,
    };
  });
}

export async function revokeStaffInvitation(
  supabase: SupabaseClient,
  invitationId: string,
): Promise<void> {
  const { error } = await supabase.rpc("revoke_staff_invitation", {
    p_invitation_id: invitationId,
  });

  if (error) {
    throw new Error(`Failed to revoke invitation: ${error.message}`);
  }
}

export async function removeStaffMemberRecord(
  supabase: SupabaseClient,
  membershipId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("remove_staff_member", {
    p_membership_id: membershipId,
  });

  if (error) {
    throw new Error(`Failed to remove staff member: ${error.message}`);
  }

  return data === true;
}

export async function getProviderById(
  supabase: SupabaseClient,
  providerId: string,
): Promise<Provider | null> {
  const { data, error } = await supabase
    .from("providers")
    .select("*")
    .eq("id", providerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch provider: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapProvider(data);
}

function mapProvider(data: Record<string, unknown>): Provider {
  return {
    id: data.id as string,
    providerType: data.provider_type as ProviderType,
    displayName: data.display_name as string,
    slug: data.slug as string,
    description: data.description as string | null,
    profileImageUrl: data.profile_image_url as string | null,
    contactPhone: data.contact_phone as string | null,
    contactEmail: data.contact_email as string | null,
    publicAddress: data.public_address as string | null,
    serviceArea: data.service_area as string | null,
    supportedDevices: (data.supported_devices as string[] | null) ?? [],
    acceptingRequests: data.accepting_requests as boolean,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}

export async function getPublicProviderProfile(
  supabase: SupabaseClient,
  slugOrId: string,
): Promise<PublicProviderProfile | null> {
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      slugOrId,
    );

  let query = supabase.from("public_provider_profiles").select("*");
  if (isUuid) {
    query = query.eq("id", slugOrId);
  } else {
    query = query.eq("slug", slugOrId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch public provider: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    providerType: data.provider_type as ProviderType,
    displayName: data.display_name,
    slug: data.slug,
    description: data.description,
    profileImageUrl: data.profile_image_url,
    publicAddress: data.public_address,
    serviceArea: data.service_area,
    supportedDevices: data.supported_devices ?? [],
    serviceModes: (
      (data.service_modes ?? []) as Array<{
        mode: ProviderServiceMode["mode"];
        details?: string | null;
      }>
    ).map((mode) => ({
      mode: mode.mode,
      details: mode.details ?? null,
    })),
    acceptingRequests: data.accepting_requests,
    createdAt: data.created_at,
  };
}

export async function getProviderUserProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProviderUserProfile | null> {
  const { data, error } = await supabase
    .from("provider_user_profiles")
    .select(
      "user_id, display_name, contact_phone, avatar_url, created_at, updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch user profile: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapProviderUserProfile(data);
}

function mapProviderUserProfile(
  data: Record<string, unknown>,
): ProviderUserProfile {
  return {
    userId: data.user_id as string,
    displayName: data.display_name as string,
    contactPhone: data.contact_phone as string | null,
    avatarUrl: data.avatar_url as string | null,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}
