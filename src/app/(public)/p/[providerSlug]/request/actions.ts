"use server";

import {
  RepairRequestError,
  submitRepairRequest,
  submitRepairRequestSchema,
  type RepairRequestReceipt,
} from "@/features/repair-requests";

export interface SubmitRepairRequestActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  receipt?: RepairRequestReceipt;
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

function collectValues(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    [...formData.entries()].flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value] as const] : [],
    ),
  );
}

export async function submitRepairRequestAction(
  providerSlug: string,
  _previousState: SubmitRepairRequestActionState | null,
  formData: FormData,
): Promise<SubmitRepairRequestActionState> {
  const values = collectValues(formData);
  const parsed = submitRepairRequestSchema.safeParse(values);

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Please review the Request details",
      fieldErrors: collectFieldErrors(parsed.error.issues),
      values,
    };
  }

  try {
    const receipt = await submitRepairRequest(providerSlug, parsed.data);
    return { receipt };
  } catch (error) {
    return {
      error:
        error instanceof RepairRequestError
          ? error.message
          : "Unable to submit this Repair Request. Please try again.",
      values,
    };
  }
}
