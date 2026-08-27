"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  acceptStaffInvitation,
  acceptStaffInvitationSchema,
  createIndependentProviderSchema,
  createProvider,
  createShopProviderSchema,
  isProviderNameConflictError,
} from "@/features/providers";
import { createClient } from "@/lib/supabase/server";

export interface OnboardingActionState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

function readServiceModes(formData: FormData) {
  return formData.getAll("serviceModes").map((value) => {
    const mode = value.toString();
    const details = formData.get(`serviceModeDetails.${mode}`)?.toString();

    return {
      mode,
      details: details || undefined,
    };
  });
}

export async function onboardIndependentAction(
  _prevState: OnboardingActionState | null,
  formData: FormData,
): Promise<OnboardingActionState> {
  const supabase = await createClient();
  const rawData = {
    ownerName: formData.get("ownerName")?.toString() ?? "",
    ownerContactPhone:
      formData.get("ownerContactPhone")?.toString() || undefined,
    displayName: formData.get("displayName")?.toString() ?? "",
    description: formData.get("description")?.toString() || undefined,
    contactEmail: formData.get("contactEmail")?.toString() || undefined,
    contactPhone: formData.get("contactPhone")?.toString() || undefined,
    publicAddress: formData.get("publicAddress")?.toString() || undefined,
    serviceArea: formData.get("serviceArea")?.toString() || undefined,
    supportedDevices: formData
      .getAll("supportedDevices")
      .map((d) => d.toString()),
    serviceModes: readServiceModes(formData),
    acceptingRequests: formData.get("acceptingRequests") === "on",
  };

  const parsed = createIndependentProviderSchema.safeParse(rawData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      if (issue.path[0]) {
        fieldErrors[issue.path[0].toString()] = issue.message;
      }
    });
    return {
      error:
        parsed.error.issues[0]?.message ??
        "Invalid independent provider details",
      fieldErrors,
    };
  }

  try {
    await createProvider(
      {
        displayName: parsed.data.displayName,
        providerType: "INDEPENDENT",
        ownerDisplayName: parsed.data.ownerName,
        ownerContactPhone: parsed.data.ownerContactPhone,
        description: parsed.data.description,
        contactEmail: parsed.data.contactEmail,
        contactPhone: parsed.data.contactPhone,
        publicAddress: parsed.data.publicAddress,
        serviceArea: parsed.data.serviceArea,
        supportedDevices: parsed.data.supportedDevices,
        serviceModes: parsed.data.serviceModes,
        acceptingRequests: parsed.data.acceptingRequests,
      },
      supabase,
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to create independent provider";
    const duplicate = isProviderNameConflictError(err);
    return {
      error: duplicate
        ? "This business name is already taken. Please choose a unique name."
        : message,
      fieldErrors: duplicate
        ? {
            displayName:
              "This name is already taken. Please choose a unique name.",
          }
        : undefined,
    };
  }

  redirect("/dashboard");
}

export async function onboardShopAction(
  _prevState: OnboardingActionState | null,
  formData: FormData,
): Promise<OnboardingActionState> {
  const supabase = await createClient();
  const rawData = {
    ownerName: formData.get("ownerName")?.toString() ?? "",
    ownerContactPhone:
      formData.get("ownerContactPhone")?.toString() || undefined,
    displayName: formData.get("displayName")?.toString() ?? "",
    description: formData.get("description")?.toString() || undefined,
    contactEmail: formData.get("contactEmail")?.toString() || undefined,
    contactPhone: formData.get("contactPhone")?.toString() || undefined,
    publicAddress: formData.get("publicAddress")?.toString() || undefined,
    serviceArea: formData.get("serviceArea")?.toString() || undefined,
    supportedDevices: formData
      .getAll("supportedDevices")
      .map((d) => d.toString()),
    serviceModes: readServiceModes(formData),
    acceptingRequests: formData.get("acceptingRequests") === "on",
  };

  const parsed = createShopProviderSchema.safeParse(rawData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      if (issue.path[0]) {
        fieldErrors[issue.path[0].toString()] = issue.message;
      }
    });
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid shop provider details",
      fieldErrors,
    };
  }

  try {
    await createProvider(
      {
        displayName: parsed.data.displayName,
        providerType: "SHOP",
        ownerDisplayName: parsed.data.ownerName,
        ownerContactPhone: parsed.data.ownerContactPhone,
        description: parsed.data.description,
        contactEmail: parsed.data.contactEmail,
        contactPhone: parsed.data.contactPhone,
        publicAddress: parsed.data.publicAddress,
        serviceArea: parsed.data.serviceArea,
        supportedDevices: parsed.data.supportedDevices,
        serviceModes: parsed.data.serviceModes,
        acceptingRequests: parsed.data.acceptingRequests,
      },
      supabase,
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to create shop provider";
    const duplicate = isProviderNameConflictError(err);
    return {
      error: duplicate
        ? "This business name is already taken. Please choose a unique name."
        : message,
      fieldErrors: duplicate
        ? {
            displayName:
              "This name is already taken. Please choose a unique name.",
          }
        : undefined,
    };
  }

  redirect("/dashboard");
}

export async function acceptStaffInviteAction(
  _prevState: OnboardingActionState | null,
  formData: FormData,
): Promise<OnboardingActionState> {
  const supabase = await createClient();
  const token = formData.get("token")?.toString()?.trim() ?? "";
  const fullName =
    formData.get("fullName")?.toString()?.trim() ||
    formData.get("displayName")?.toString()?.trim() ||
    "";
  const contactPhone =
    formData.get("contactPhone")?.toString()?.trim() || undefined;

  const parsed = acceptStaffInvitationSchema.safeParse({
    token,
    displayName: fullName,
    contactPhone,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      const field = issue.path[0]?.toString();
      if (field) {
        fieldErrors[field === "displayName" ? "fullName" : field] =
          issue.message;
      }
    });
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid invitation details",
      fieldErrors,
    };
  }

  try {
    await acceptStaffInvitation(
      {
        token: parsed.data.token,
        displayName: parsed.data.displayName,
        contactPhone: parsed.data.contactPhone,
      },
      supabase,
    );

    const cookieStore = await cookies();
    cookieStore.delete("tracknologia_staff_invite");
    cookieStore.delete("pending_invite_token");
  } catch (err: unknown) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to accept staff invite",
    };
  }

  redirect("/dashboard");
}
