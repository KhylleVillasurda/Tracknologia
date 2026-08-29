"use server";

import {
  createStaffInvitation,
  removeStaffMember,
  revokeStaffInvitation,
  StaffInvitationError,
} from "@/features/providers";
import { AuthError } from "@/features/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type InviteStaffState = {
  success?: string;
  error?: string;
  fieldErrors?: {
    email?: string;
  };
  reused?: boolean;
  token?: string;
  inviteUrl?: string;
  emailDeliveryFailed?: boolean;
};

export type RemoveStaffState = {
  success?: string;
  error?: string;
};

export async function inviteStaffAction(
  _prevState: InviteStaffState | null,
  formData: FormData,
): Promise<InviteStaffState> {
  const supabase = await createClient();
  const rawEmail = formData.get("email")?.toString() ?? "";

  try {
    const result = await createStaffInvitation({ email: rawEmail }, supabase);

    revalidatePath("/dashboard/team");

    if (result.kind === "reused") {
      return {
        success: `A pending invitation already exists for ${result.invitation.email}. Revoke it and invite again to create a fresh invitation link.`,
        reused: true,
      };
    }

    if (!result.emailDeliverySuccess) {
      return {
        success: `Invitation created for ${result.invitation.email}, but email delivery failed. Copy this link now, or revoke the invitation and invite again to generate and deliver a new link.`,
        token: result.rawToken,
        inviteUrl: result.inviteUrl,
        emailDeliveryFailed: true,
      };
    }

    return {
      success: `Invitation sent to ${result.invitation.email}`,
      token: result.rawToken,
      inviteUrl: result.inviteUrl,
      emailDeliveryFailed: false,
    };
  } catch (error) {
    console.error("Staff invitation creation failed", error);

    if (error instanceof StaffInvitationError) {
      if (error.code === "INVALID_INPUT") {
        return { error: error.message, fieldErrors: { email: error.message } };
      }

      if (
        error.code === "UNAVAILABLE_FOR_PROVIDER" ||
        error.code === "RECIPIENT_INELIGIBLE"
      ) {
        return { error: error.message };
      }
    }

    if (error instanceof AuthError) {
      if (error.code === "UNAUTHENTICATED") {
        return { error: "Please sign in before inviting staff" };
      }
      if (error.code === "UNAUTHORIZED_ROLE") {
        return { error: "Only Shop Owners can invite staff" };
      }
    }

    return {
      error:
        "Staff invitations are temporarily unavailable. Please try again later.",
    };
  }
}

export async function revokeStaffAction(
  _prevState: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const supabase = await createClient();
  const invitationId = formData.get("invitationId") as string;

  if (!invitationId) {
    return { error: "Invitation ID is required" };
  }

  try {
    await revokeStaffInvitation(invitationId, supabase);
    revalidatePath("/dashboard/team");
    return { success: "Invitation revoked" };
  } catch {
    return {
      error: "Unable to revoke invitation",
    };
  }
}

export async function removeStaffAction(
  _prevState: RemoveStaffState | null,
  formData: FormData,
): Promise<RemoveStaffState> {
  const supabase = await createClient();
  const membershipId = formData.get("membershipId")?.toString() ?? "";

  try {
    const result = await removeStaffMember({ membershipId }, supabase);

    revalidatePath("/dashboard/team");

    if (!result.removed) {
      return { error: "This team member can no longer be removed" };
    }

    return { success: "Team member removed" };
  } catch (error) {
    console.error("Staff removal failed", error);
    return { error: "Unable to remove this team member right now" };
  }
}
