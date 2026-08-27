import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ServiceMode } from "@/features/providers";
import { createPublicOperationClient } from "@/lib/supabase/service";

import { lookupPublicRepairRecord } from "./persistence";
import { trackingCodeSchema } from "./schemas";
import type { PublicRepairView, TrackingStatus } from "./types";

const STATUS_PRESENTATION: Record<
  TrackingStatus,
  { label: string; description: string }
> = {
  IN_PROGRESS: {
    label: "In progress",
    description: "Provider is actively working on your repair.",
  },
  WAITING_FOR_PARTS: {
    label: "Waiting for parts",
    description:
      "Work is paused while Provider waits for required parts or materials.",
  },
  AWAITING_APPROVAL: {
    label: "Awaiting approval",
    description: "Provider is waiting for your approval before work continues.",
  },
  READY: {
    label: "Ready",
    description:
      "Repair work is finished and your device is ready for handover.",
  },
  COMPLETED: {
    label: "Completed",
    description: "Repair and device handover are complete.",
  },
  SUBMITTED: {
    label: "Request Submitted",
    description:
      "Provider has received your repair request and is reviewing it. Active repair tracking begins once accepted.",
  },
  DECLINED: {
    label: "Request Declined",
    description:
      "Provider was unable to accept this repair request. Please contact the provider for alternative options.",
  },
};

const SERVICE_MODE_LABELS: Record<ServiceMode, string> = {
  DROP_OFF: "Drop-off",
  MEETUP: "Meetup",
  HOME_SERVICE: "Home service",
  OTHER: "Other arrangement",
};

const READY_HANDOVER_MESSAGES: Record<ServiceMode, string> = {
  DROP_OFF:
    "Your device is ready for pickup. Follow the arrangement agreed with your Provider.",
  MEETUP:
    "Your device is ready. Contact your Provider to arrange the agreed meetup.",
  HOME_SERVICE:
    "Your device is ready. Follow the home-service arrangement agreed with your Provider.",
  OTHER: "Your device is ready. Contact your Provider to arrange handover.",
};

function composeDeviceSummary(
  deviceType: string,
  brand: string | null,
  model: string | null,
) {
  const makeAndModel = [brand, model].filter(Boolean).join(" ");
  return makeAndModel ? `${makeAndModel} · ${deviceType}` : deviceType;
}

function getReadyHandoverMessage(
  currentStatus: TrackingStatus,
  serviceMode: ServiceMode | null,
) {
  if (currentStatus !== "READY") {
    return null;
  }

  return serviceMode
    ? READY_HANDOVER_MESSAGES[serviceMode]
    : "Your device is ready. Contact your Provider to arrange handover.";
}

export async function lookupRepairByTrackingCode(
  code: unknown,
  client?: SupabaseClient,
): Promise<PublicRepairView | null> {
  const parsedCode = trackingCodeSchema.safeParse(code);
  if (!parsedCode.success) {
    return null;
  }

  const supabase = client ?? (await createPublicOperationClient());
  const record = await lookupPublicRepairRecord(supabase, parsedCode.data);
  if (!record) {
    return null;
  }

  const currentStatus = record.current_status;
  const status = STATUS_PRESENTATION[currentStatus];

  return {
    providerDisplayName: record.provider_display_name,
    deviceSummary: composeDeviceSummary(
      record.device_type,
      record.brand,
      record.model,
    ),
    currentStatus,
    statusLabel: status.label,
    statusDescription: status.description,
    serviceMode: record.service_mode,
    serviceModeLabel: record.service_mode
      ? SERVICE_MODE_LABELS[record.service_mode]
      : null,
    handoverMessage: getReadyHandoverMessage(
      currentStatus,
      record.service_mode,
    ),
    lastUpdatedAt: record.last_updated_at,
    customerUpdates: record.customer_updates.map((update) => ({
      message: update.message,
      createdAt: update.created_at,
    })),
    trackingType: record.tracking_type,
    trackingCode: record.reference_code,
  };
}
