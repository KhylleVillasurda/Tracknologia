"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  addCustomerUpdate,
  changeRepairStatus,
  changeRepairStatusSchema,
  completeRepair,
  createRepair,
  customerUpdateSchema,
  directRepairSchema,
  RepairError,
  updateRepairDetails,
  updateRepairDetailsSchema,
} from "@/features/repairs";

export interface RepairActionState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
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

function stringValues(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    [...formData.entries()]
      .filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      )
      .filter(([key]) => key !== "repairId"),
  );
}

function repairInput(formData: FormData) {
  return {
    customerName: formData.get("customerName")?.toString() ?? "",
    customerPhone: formData.get("customerPhone")?.toString() ?? "",
    customerEmail: formData.get("customerEmail")?.toString() || undefined,
    deviceType: formData.get("deviceType")?.toString() ?? "",
    brand: formData.get("brand")?.toString() || undefined,
    model: formData.get("model")?.toString() || undefined,
    serialNumber: formData.get("serialNumber")?.toString() || undefined,
    colorVariant: formData.get("colorVariant")?.toString() || undefined,
    deviceSpecs: formData.get("deviceSpecs")?.toString() || undefined,
    physicalCondition:
      formData.get("physicalCondition")?.toString() || undefined,
    accessoriesReceived:
      formData.get("accessoriesReceived")?.toString() || undefined,
    reportedProblem: formData.get("reportedProblem")?.toString() ?? "",
    initialObservation:
      formData.get("initialObservation")?.toString() || undefined,
    diagnosis: formData.get("diagnosis")?.toString() || undefined,
    internalNotes: formData.get("internalNotes")?.toString() || undefined,
    serviceMode: formData.get("serviceMode")?.toString() || undefined,
    serviceModeDetails:
      formData.get("serviceModeDetails")?.toString() || undefined,
  };
}

function repairErrorMessage(error: unknown, fallback: string) {
  return error instanceof RepairError ? error.message : fallback;
}

function revalidateRepairSurfaces(repairId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/repairs");
  if (repairId) {
    revalidatePath(`/dashboard/repairs/${repairId}`);
  }
}

export async function createRepairAction(
  _previousState: RepairActionState | null,
  formData: FormData,
): Promise<RepairActionState> {
  const values = stringValues(formData);
  const parsed = directRepairSchema.safeParse(repairInput(formData));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please review the Repair",
      fieldErrors: collectFieldErrors(parsed.error.issues),
      values,
    };
  }

  let repairId: string;
  try {
    const repair = await createRepair(parsed.data);
    repairId = repair.repairId;
  } catch (error) {
    return {
      error: repairErrorMessage(error, "Unable to create this Repair"),
      values,
    };
  }

  revalidateRepairSurfaces(repairId);
  redirect(`/dashboard/repairs/${repairId}`);
}

export async function updateRepairDetailsAction(
  _previousState: RepairActionState | null,
  formData: FormData,
): Promise<RepairActionState> {
  const repairId = formData.get("repairId")?.toString() ?? "";
  const parsed = updateRepairDetailsSchema.safeParse(repairInput(formData));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please review the Repair",
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  try {
    await updateRepairDetails(repairId, parsed.data);
    revalidateRepairSurfaces(repairId);
    return { success: "Repair details updated" };
  } catch (error) {
    return {
      error: repairErrorMessage(error, "Unable to update this Repair"),
    };
  }
}

export async function changeRepairStatusAction(
  _previousState: RepairActionState | null,
  formData: FormData,
): Promise<RepairActionState> {
  const repairId = formData.get("repairId")?.toString() ?? "";
  const parsed = changeRepairStatusSchema.safeParse({
    nextStatus: formData.get("nextStatus")?.toString(),
  });
  if (!parsed.success) {
    return { error: "Select a valid next Repair status" };
  }

  try {
    await changeRepairStatus(repairId, parsed.data.nextStatus);
    revalidateRepairSurfaces(repairId);
    return { success: "Repair status updated" };
  } catch (error) {
    return {
      error: repairErrorMessage(error, "Unable to change Repair status"),
    };
  }
}

export async function completeRepairAction(
  _previousState: RepairActionState | null,
  formData: FormData,
): Promise<RepairActionState> {
  const repairId = formData.get("repairId")?.toString() ?? "";
  try {
    await completeRepair(repairId);
    revalidateRepairSurfaces(repairId);
    return { success: "Repair completed" };
  } catch (error) {
    return {
      error: repairErrorMessage(error, "Unable to complete this Repair"),
    };
  }
}

export async function addCustomerUpdateAction(
  _previousState: RepairActionState | null,
  formData: FormData,
): Promise<RepairActionState> {
  const repairId = formData.get("repairId")?.toString() ?? "";
  const parsed = customerUpdateSchema.safeParse({
    message: formData.get("message")?.toString() ?? "",
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Enter a Customer Update",
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  try {
    await addCustomerUpdate(repairId, parsed.data.message);
    revalidateRepairSurfaces(repairId);
    return { success: "Customer Update added" };
  } catch (error) {
    return {
      error: repairErrorMessage(error, "Unable to add Customer Update"),
    };
  }
}
