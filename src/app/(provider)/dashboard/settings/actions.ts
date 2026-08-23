"use server";

import { revalidatePath } from "next/cache";

import {
  providerServiceModesSchema,
  setServiceModes,
  updateCurrentProviderUserProfile,
  updateProviderProfile,
  updateProviderProfileSchema,
  updateProviderUserProfileSchema,
} from "@/features/providers";
import { createClient } from "@/lib/supabase/server";

export interface SettingsActionState {
  success?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function collectFieldErrors(
  issues: Array<{ path: PropertyKey[]; message: string }>,
) {
  const fieldErrors: Record<string, string> = {};

  for (const issue of issues) {
    const field = issue.path[0]?.toString();
    if (field && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }

  return fieldErrors;
}

export async function updateProviderProfileAction(
  _previousState: SettingsActionState | null,
  formData: FormData,
): Promise<SettingsActionState> {
  const input = {
    displayName: formData.get("displayName")?.toString() ?? "",
    description: formData.get("description")?.toString() || undefined,
    profileImageUrl: formData.get("profileImageUrl")?.toString() || undefined,
    contactEmail: formData.get("contactEmail")?.toString() || undefined,
    contactPhone: formData.get("contactPhone")?.toString() || undefined,
    publicAddress: formData.get("publicAddress")?.toString() || undefined,
    serviceArea: formData.get("serviceArea")?.toString() || undefined,
    supportedDevices: (formData.get("supportedDevices")?.toString() ?? "")
      .split(",")
      .map((device) => device.trim())
      .filter(Boolean),
    acceptingRequests: formData.get("acceptingRequests") === "on",
  };
  const parsed = updateProviderProfileSchema.safeParse(input);

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid Provider profile",
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  try {
    const supabase = await createClient();
    await updateProviderProfile(parsed.data, supabase);
    revalidatePath("/dashboard/settings");
    return { success: "Provider profile updated" };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update Provider profile",
    };
  }
}

export async function updatePersonalProfileAction(
  _previousState: SettingsActionState | null,
  formData: FormData,
): Promise<SettingsActionState> {
  const input = {
    displayName: formData.get("displayName")?.toString() ?? "",
    contactPhone: formData.get("contactPhone")?.toString() || undefined,
    avatarUrl: formData.get("avatarUrl")?.toString() || undefined,
  };
  const parsed = updateProviderUserProfileSchema.safeParse(input);

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid personal profile",
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  try {
    const supabase = await createClient();
    await updateCurrentProviderUserProfile(parsed.data, supabase);
    revalidatePath("/dashboard/settings");
    return { success: "Personal profile updated" };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update personal profile",
    };
  }
}

export async function updateServiceModesAction(
  _previousState: SettingsActionState | null,
  formData: FormData,
): Promise<SettingsActionState> {
  const modes = formData.getAll("serviceModes").map((value) => {
    const mode = value.toString();
    return {
      mode,
      details:
        formData.get(`serviceModeDetails.${mode}`)?.toString() || undefined,
    };
  });
  const parsed = providerServiceModesSchema.safeParse(modes);

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Invalid Service Mode configuration",
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  try {
    const supabase = await createClient();
    await setServiceModes(parsed.data, supabase);
    revalidatePath("/dashboard/settings");
    return { success: "Service Modes updated" };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update Service Modes",
    };
  }
}
