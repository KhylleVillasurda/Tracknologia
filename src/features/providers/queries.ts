import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  getInvitationDetailsByTokenHash,
  getProviderById,
  getProviderUserProfile as getProviderUserProfilePersistence,
  getPublicProviderProfile,
  getProviderServiceModeRecords,
  hashInvitationToken,
  listStaffInvitations as listStaffInvitationsPersistence,
  listTeamMembers as listTeamMembersPersistence,
} from "./persistence";
import type {
  InvitationShopDetails,
  Provider,
  ProviderInvitation,
  ProviderServiceMode,
  ProviderUserProfile,
  PublicProviderProfile,
  TeamMember,
} from "./types";
import { acceptStaffInvitationSchema } from "./schemas";

export async function getProvider(
  providerId: string,
  client?: SupabaseClient,
): Promise<Provider | null> {
  const supabase = client ?? (await createClient());
  return getProviderById(supabase, providerId);
}

export async function getPublicProvider(
  slugOrId: string,
  client?: SupabaseClient,
): Promise<PublicProviderProfile | null> {
  const supabase = client ?? (await createClient());
  return getPublicProviderProfile(supabase, slugOrId);
}

export async function getInvitationForOnboarding(
  rawToken: string,
  client?: SupabaseClient,
): Promise<InvitationShopDetails | null> {
  const supabase = client ?? (await createClient());
  const tokenResult =
    acceptStaffInvitationSchema.shape.token.safeParse(rawToken);
  if (!tokenResult.success) {
    return null;
  }
  const tokenHash = hashInvitationToken(tokenResult.data);
  return getInvitationDetailsByTokenHash(supabase, tokenHash);
}

export async function getProviderServiceModes(
  providerId: string,
  client?: SupabaseClient,
): Promise<ProviderServiceMode[]> {
  const supabase = client ?? (await createClient());
  return getProviderServiceModeRecords(supabase, providerId);
}

export async function listTeamMembers(
  providerId: string,
  client?: SupabaseClient,
): Promise<TeamMember[]> {
  const supabase = client ?? (await createClient());
  return listTeamMembersPersistence(supabase, providerId);
}

export async function listPendingStaffInvitations(
  providerId: string,
  client?: SupabaseClient,
): Promise<ProviderInvitation[]> {
  const supabase = client ?? (await createClient());
  return listStaffInvitationsPersistence(supabase, providerId);
}

export async function getProviderUserProfile(
  userId: string,
  client?: SupabaseClient,
): Promise<ProviderUserProfile | null> {
  const supabase = client ?? (await createClient());
  return getProviderUserProfilePersistence(supabase, userId);
}
