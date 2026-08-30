import "server-only";

import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireProviderRole, requireUser } from "@/features/auth";
import { getAppOrigin } from "@/lib/config/server";
import { sendStaffInviteEmail } from "@/lib/email/client";
import { createClient } from "@/lib/supabase/server";

import {
  acceptStaffInvitation as acceptStaffInvitationPersistence,
  createProviderWithOwner,
  hashInvitationToken,
  insertStaffInvitationRecord,
  removeStaffMemberRecord,
  replaceProviderServiceModes,
  revokeStaffInvitation as revokeStaffInvitationPersistence,
  StaffInvitationPersistenceError,
  updateProviderProfileRecord,
  updateProviderUserProfileRecord,
} from "./persistence";
import {
  acceptStaffInvitationSchema,
  createIndependentProviderSchema,
  createShopProviderSchema,
  providerServiceModesSchema,
  removeStaffMemberSchema,
  staffInvitationSchema,
  updateProviderProfileSchema,
  updateProviderUserProfileSchema,
} from "./schemas";
import type {
  AcceptStaffInvitationInput,
  CreateProviderInput,
  Provider,
  ProviderInvitation,
  ProviderServiceMode,
  ProviderUserProfile,
  UpdateProviderProfileInput,
  UpdateProviderUserProfileInput,
} from "./types";

/**
 * Predicate to determine if an error represents a provider name/slug collision.
 */
export function isProviderNameConflictError(err: unknown): boolean {
  if (!err) return false;
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes(
      "A provider with this name already exists. Please choose a different name.",
    ) || message.includes("providers_slug_key")
  );
}

/**
 * Creates a new Provider with its initial OWNER membership and person profile atomically.
 * Owns business validation, authentication precondition, and value normalization.
 */
export async function createProvider(
  input: CreateProviderInput,
  client?: SupabaseClient,
): Promise<{ providerId: string; membershipId: string; slug: string }> {
  const supabase = client ?? (await createClient());

  // 1. Require authenticated user precondition
  const user = await requireUser(supabase);
  if (!user) {
    throw new Error("Authentication required to create a provider");
  }

  // 2. Validate input with feature Zod schema based on provider type
  if (input.providerType === "INDEPENDENT") {
    const parsed = createIndependentProviderSchema.safeParse({
      ownerName: input.ownerDisplayName,
      ownerContactPhone: input.ownerContactPhone,
      displayName: input.displayName,
      description: input.description,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      publicAddress: input.publicAddress,
      serviceArea: input.serviceArea,
      supportedDevices: input.supportedDevices,
      serviceModes: input.serviceModes,
      acceptingRequests: input.acceptingRequests,
    });
    if (!parsed.success) {
      throw new Error(
        parsed.error.issues[0]?.message ?? "Invalid independent provider input",
      );
    }
  } else if (input.providerType === "SHOP") {
    const parsed = createShopProviderSchema.safeParse({
      ownerName: input.ownerDisplayName,
      ownerContactPhone: input.ownerContactPhone,
      displayName: input.displayName,
      description: input.description,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      publicAddress: input.publicAddress,
      serviceArea: input.serviceArea,
      supportedDevices: input.supportedDevices,
      serviceModes: input.serviceModes,
      acceptingRequests: input.acceptingRequests,
    });
    if (!parsed.success) {
      throw new Error(
        parsed.error.issues[0]?.message ?? "Invalid shop provider input",
      );
    }
  } else {
    throw new Error("Invalid provider type");
  }

  // 3. Normalize values
  const normalizedInput: CreateProviderInput = {
    displayName: input.displayName.trim(),
    providerType: input.providerType,
    ownerDisplayName: input.ownerDisplayName
      ? input.ownerDisplayName.trim()
      : undefined,
    ownerContactPhone: input.ownerContactPhone
      ? input.ownerContactPhone.trim()
      : undefined,
    description: input.description ? input.description.trim() : undefined,
    contactEmail: input.contactEmail
      ? input.contactEmail.trim().toLowerCase()
      : undefined,
    contactPhone: input.contactPhone ? input.contactPhone.trim() : undefined,
    publicAddress: input.publicAddress ? input.publicAddress.trim() : undefined,
    serviceArea: input.serviceArea ? input.serviceArea.trim() : undefined,
    supportedDevices: [...new Set(input.supportedDevices || [])],
    serviceModes: (input.serviceModes || []).map((mode) => ({
      mode: mode.mode,
      details: mode.details?.trim() || null,
    })),
    acceptingRequests: input.acceptingRequests ?? true,
  };

  return createProviderWithOwner(supabase, normalizedInput);
}

/**
 * Updates the authenticated Owner's Provider business profile.
 * Provider identity, type, slug, and ownership are intentionally not editable.
 */
export async function updateProviderProfile(
  input: UpdateProviderProfileInput,
  client?: SupabaseClient,
): Promise<Provider> {
  const supabase = client ?? (await createClient());
  const context = await requireProviderRole(["OWNER"], supabase);
  const parsed = updateProviderProfileSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Invalid Provider profile input",
    );
  }

  return updateProviderProfileRecord(supabase, context.providerId, {
    displayName: parsed.data.displayName,
    description: parsed.data.description || undefined,
    profileImageUrl: parsed.data.profileImageUrl || undefined,
    contactPhone: parsed.data.contactPhone || undefined,
    contactEmail: parsed.data.contactEmail
      ? parsed.data.contactEmail.toLowerCase()
      : undefined,
    publicAddress: parsed.data.publicAddress || undefined,
    serviceArea: parsed.data.serviceArea || undefined,
    supportedDevices: parsed.data.supportedDevices,
    acceptingRequests: parsed.data.acceptingRequests,
  });
}

/** Updates the authenticated user's canonical person profile only. */
export async function updateCurrentProviderUserProfile(
  input: UpdateProviderUserProfileInput,
  client?: SupabaseClient,
): Promise<ProviderUserProfile> {
  const supabase = client ?? (await createClient());
  const user = await requireUser(supabase);
  const parsed = updateProviderUserProfileSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Invalid personal profile input",
    );
  }

  return updateProviderUserProfileRecord(supabase, user.id, {
    displayName: parsed.data.displayName,
    contactPhone: parsed.data.contactPhone || undefined,
    avatarUrl: parsed.data.avatarUrl || undefined,
  });
}

/** Atomically replaces the authenticated Owner's supported Service Modes. */
export async function setServiceModes(
  modes: ProviderServiceMode[],
  client?: SupabaseClient,
): Promise<ProviderServiceMode[]> {
  const supabase = client ?? (await createClient());
  await requireProviderRole(["OWNER"], supabase);
  const parsed = providerServiceModesSchema.safeParse(modes);

  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Invalid Service Mode configuration",
    );
  }

  return replaceProviderServiceModes(
    supabase,
    parsed.data.map((mode) => ({
      mode: mode.mode,
      details: mode.details || null,
    })),
  );
}

export interface CreatedStaffInvitationResult {
  kind: "created";
  invitation: ProviderInvitation;
  rawToken: string;
  inviteUrl: string;
  emailDeliverySuccess: boolean;
}

export interface ReusedStaffInvitationResult {
  kind: "reused";
  invitation: ProviderInvitation;
}

export type CreateStaffInvitationResult =
  CreatedStaffInvitationResult | ReusedStaffInvitationResult;

export type StaffInvitationErrorCode =
  | "INVALID_INPUT"
  | "UNAVAILABLE_FOR_PROVIDER"
  | "RECIPIENT_INELIGIBLE"
  | "TEMPORARY_FAILURE";

/** Stable feature-level failures for the Staff invitation workflow. */
export class StaffInvitationError extends Error {
  constructor(
    message: string,
    public readonly code: StaffInvitationErrorCode,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StaffInvitationError";
  }
}

/**
 * Creates a secure staff invitation for a Shop Provider.
 * Generates a high-entropy raw token, persists only its SHA-256 digest,
 * and attempts email delivery.
 *
 * If the Shop already has an active pending invitation for the same email,
 * the existing invitation is returned (`reused`, no new credential, no email)
 * so retries and double-clicks cannot create multiple simultaneously valid
 * invitations.
 */
export async function createStaffInvitation(
  input: { email: string },
  client?: SupabaseClient,
): Promise<CreateStaffInvitationResult> {
  const supabase = client ?? (await createClient());

  // 1. Authorize: Caller must be OWNER of a SHOP provider
  const context = await requireProviderRole(["OWNER"], supabase);
  if (context.providerType !== "SHOP") {
    throw new StaffInvitationError(
      "Staff invitations are only available for Repair Shops",
      "UNAVAILABLE_FOR_PROVIDER",
    );
  }

  // 2. Validate input
  const parsed = staffInvitationSchema.safeParse(input);
  if (!parsed.success) {
    throw new StaffInvitationError(
      parsed.error.issues[0]?.message ?? "Invalid email address",
      "INVALID_INPUT",
      parsed.error,
    );
  }

  // 3. Generate raw cryptographic token and SHA-256 digest
  const rawToken = `inv_${randomBytes(24).toString("hex")}`;
  const tokenHash = hashInvitationToken(rawToken);

  // 4. Persist invitation record with hashed token (or reuse an active one)
  let persistenceResult: Awaited<
    ReturnType<typeof insertStaffInvitationRecord>
  >;
  try {
    persistenceResult = await insertStaffInvitationRecord(supabase, {
      providerId: context.providerId,
      invitedByUserId: context.userId,
      email: parsed.data.email,
      tokenHash,
    });
  } catch (error) {
    if (
      error instanceof StaffInvitationPersistenceError &&
      error.code === "RECIPIENT_INELIGIBLE"
    ) {
      throw new StaffInvitationError(
        "This person already belongs to a Provider and cannot be invited.",
        "RECIPIENT_INELIGIBLE",
        error.cause ?? error,
      );
    }

    throw new StaffInvitationError(
      "Staff invitations are temporarily unavailable. Please try again later.",
      "TEMPORARY_FAILURE",
      error,
    );
  }
  const { invitation, reused } = persistenceResult;

  if (reused) {
    return { kind: "reused", invitation };
  }

  const appOrigin = getAppOrigin();
  const fullInviteUrl = `${appOrigin}/register?invite=${rawToken}`;

  // 5. Send invitation email
  const emailResult = await sendStaffInviteEmail({
    to: invitation.email,
    shopName: context.providerName,
    inviteCode: rawToken,
    inviteUrl: fullInviteUrl,
  });

  return {
    kind: "created",
    invitation,
    rawToken,
    inviteUrl: `/register?invite=${rawToken}`,
    emailDeliverySuccess: emailResult.success,
  };
}

/**
 * Consumes a staff invitation and creates the STAFF membership and person profile atomically.
 */
export async function acceptStaffInvitation(
  input: AcceptStaffInvitationInput,
  client?: SupabaseClient,
): Promise<{ providerId: string; membershipId: string; role: "STAFF" }> {
  const supabase = client ?? (await createClient());

  const parsed = acceptStaffInvitationSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Invalid staff invitation input",
    );
  }

  const tokenHash = hashInvitationToken(parsed.data.token);

  return acceptStaffInvitationPersistence(
    supabase,
    tokenHash,
    parsed.data.displayName,
    parsed.data.contactPhone,
  );
}

/**
 * Revokes a pending staff invitation.
 */
export async function revokeStaffInvitation(
  invitationId: string,
  client?: SupabaseClient,
): Promise<void> {
  const supabase = client ?? (await createClient());
  await requireProviderRole(["OWNER"], supabase);

  return revokeStaffInvitationPersistence(supabase, invitationId);
}

export interface RemoveStaffMemberResult {
  removed: boolean;
}

/**
 * Removes one STAFF membership from the caller's own Provider.
 * Not-found, cross-Provider, and non-STAFF targets collapse into a neutral
 * `removed: false` result so membership existence is never revealed.
 */
export async function removeStaffMember(
  input: { membershipId: string },
  client?: SupabaseClient,
): Promise<RemoveStaffMemberResult> {
  const supabase = client ?? (await createClient());

  await requireProviderRole(["OWNER"], supabase);

  const parsed = removeStaffMemberSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Invalid team member identifier",
    );
  }

  const removed = await removeStaffMemberRecord(
    supabase,
    parsed.data.membershipId,
  );

  return { removed };
}
