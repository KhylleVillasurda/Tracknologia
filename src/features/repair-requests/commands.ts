import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireProviderContext } from "@/features/auth";
import { getPublicProvider } from "@/features/providers";
import {
  createRepairFromRequest,
  RepairError,
  requestOriginRepairSchema,
} from "@/features/repairs";
import { createClient } from "@/lib/supabase/server";

import {
  declineRepairRequestRecord,
  getRepairRequestRecord,
  submitRepairRequestRecord,
} from "./persistence";
import {
  providerRequestSlugSchema,
  repairRequestIdSchema,
  submitRepairRequestSchema,
} from "./schemas";
import type {
  AcceptedRepairResult,
  RepairRequestDetail,
  SubmitRepairRequestInput,
  VerifiedRepairRequestInput,
} from "./types";
import { RepairRequestError } from "./types";

function optional(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

export async function submitRepairRequest(
  providerSlug: string,
  input: SubmitRepairRequestInput,
  client?: SupabaseClient,
) {
  const slug = providerRequestSlugSchema.safeParse(providerSlug);
  const parsed = submitRepairRequestSchema.safeParse(input);

  if (!slug.success) {
    throw new RepairRequestError(
      slug.error.issues[0]?.message ?? "Invalid Provider identifier",
      "INVALID_INPUT",
    );
  }

  if (!parsed.success) {
    throw new RepairRequestError(
      parsed.error.issues[0]?.message ?? "Invalid Repair Request",
      "INVALID_INPUT",
    );
  }

  const supabase = client ?? (await createClient());
  const provider = await getPublicProvider(slug.data, supabase);
  if (!provider) {
    throw new RepairRequestError(
      "This Provider is not available for new Repair Requests",
      "PROVIDER_UNAVAILABLE",
    );
  }

  if (
    parsed.data.preferredServiceMode &&
    !provider.serviceModes.some(
      (mode) => mode.mode === parsed.data.preferredServiceMode,
    )
  ) {
    throw new RepairRequestError(
      "Selected Service Mode is no longer available",
      "UNSUPPORTED_SERVICE_MODE",
    );
  }

  return submitRepairRequestRecord(supabase, slug.data, {
    customerName: parsed.data.customerName,
    customerPhone: parsed.data.customerPhone,
    customerEmail: optional(parsed.data.customerEmail)?.toLowerCase(),
    deviceType: parsed.data.deviceType,
    brand: optional(parsed.data.brand),
    model: optional(parsed.data.model),
    serialNumber: optional(parsed.data.serialNumber),
    colorVariant: optional(parsed.data.colorVariant),
    deviceSpecs: optional(parsed.data.deviceSpecs),
    reportedProblem: parsed.data.reportedProblem,
    problemStartedAt: optional(parsed.data.problemStartedAt),
    precedingEvent: optional(parsed.data.precedingEvent),
    troubleshootingAttempted: optional(parsed.data.troubleshootingAttempted),
    additionalInformation: optional(parsed.data.additionalInformation),
    preferredServiceMode: parsed.data.preferredServiceMode || undefined,
    serviceModeDetails: optional(parsed.data.serviceModeDetails),
  });
}

export async function acceptRepairRequest(
  requestId: string,
  input: VerifiedRepairRequestInput,
  client?: SupabaseClient,
): Promise<AcceptedRepairResult> {
  const id = repairRequestIdSchema.safeParse(requestId);
  const verifiedInput = requestOriginRepairSchema.safeParse(input);
  if (!id.success) {
    throw new RepairRequestError(
      id.error.issues[0]?.message ?? "Invalid Repair Request ID",
      "INVALID_INPUT",
    );
  }

  if (!verifiedInput.success) {
    throw new RepairRequestError(
      verifiedInput.error.issues[0]?.message ??
        "Invalid Repair acceptance input",
      "INVALID_INPUT",
    );
  }

  const supabase = client ?? (await createClient());
  const context = await requireProviderContext(supabase);
  const request = await getRepairRequestRecord(
    supabase,
    context.providerId,
    id.data,
  );
  if (!request) {
    throw new RepairRequestError(
      "Repair Request was not found",
      "REQUEST_NOT_FOUND",
    );
  }
  if (request.status !== "SUBMITTED") {
    throw new RepairRequestError(
      "Repair Request has already been processed",
      "REQUEST_ALREADY_PROCESSED",
    );
  }

  try {
    return await createRepairFromRequest(id.data, verifiedInput.data, supabase);
  } catch (error) {
    if (error instanceof RepairError) {
      const code =
        error.code === "REQUEST_NOT_FOUND"
          ? "REQUEST_NOT_FOUND"
          : error.code === "REQUEST_ALREADY_PROCESSED"
            ? "REQUEST_ALREADY_PROCESSED"
            : error.code === "UNSUPPORTED_SERVICE_MODE"
              ? "UNSUPPORTED_SERVICE_MODE"
              : "INVALID_INPUT";
      throw new RepairRequestError(error.message, code);
    }
    throw error;
  }
}

export async function declineRepairRequest(
  requestId: string,
  client?: SupabaseClient,
): Promise<RepairRequestDetail> {
  const id = repairRequestIdSchema.safeParse(requestId);
  if (!id.success) {
    throw new RepairRequestError(
      "Repair Request was not found",
      "REQUEST_NOT_FOUND",
    );
  }

  const supabase = client ?? (await createClient());
  const context = await requireProviderContext(supabase);
  const request = await getRepairRequestRecord(
    supabase,
    context.providerId,
    id.data,
  );
  if (!request) {
    throw new RepairRequestError(
      "Repair Request was not found",
      "REQUEST_NOT_FOUND",
    );
  }
  if (request.status !== "SUBMITTED") {
    throw new RepairRequestError(
      "Repair Request has already been processed",
      "REQUEST_ALREADY_PROCESSED",
    );
  }

  return declineRepairRequestRecord(supabase, id.data);
}
