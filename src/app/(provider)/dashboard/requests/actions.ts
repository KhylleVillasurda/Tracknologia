"use server";

import { revalidatePath } from "next/cache";

import {
  acceptRepairRequest,
  declineRepairRequest,
  RepairRequestError,
} from "@/features/repair-requests";
import { requestOriginRepairSchema } from "@/features/repairs";

export interface RepairRequestActionState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  acceptedRepair?: {
    ticketNumber: string;
    trackingCode: string;
  };
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

export async function acceptRepairRequestAction(
  _previousState: RepairRequestActionState | null,
  formData: FormData,
): Promise<RepairRequestActionState> {
  const requestId = formData.get("requestId")?.toString() ?? "";
  const input = {
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
  const parsed = requestOriginRepairSchema.safeParse(input);

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Please review the Repair details",
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  try {
    const repair = await acceptRepairRequest(requestId, parsed.data);
    revalidatePath("/dashboard/requests");
    return {
      success: "Request accepted and Repair created",
      acceptedRepair: {
        ticketNumber: repair.ticketNumber,
        trackingCode: repair.trackingCode,
      },
    };
  } catch (error) {
    return {
      error:
        error instanceof RepairRequestError
          ? error.message
          : "Unable to accept this Repair Request",
    };
  }
}

export async function declineRepairRequestAction(
  _previousState: RepairRequestActionState | null,
  formData: FormData,
): Promise<RepairRequestActionState> {
  const requestId = formData.get("requestId")?.toString() ?? "";

  try {
    await declineRepairRequest(requestId);
    revalidatePath("/dashboard/requests");
    return { success: "Repair Request declined" };
  } catch (error) {
    return {
      error:
        error instanceof RepairRequestError
          ? error.message
          : "Unable to decline this Repair Request",
    };
  }
}
