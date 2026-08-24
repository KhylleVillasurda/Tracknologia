"use server";

import {
  lookupRepairByTrackingCode,
  type PublicRepairView,
} from "@/features/tracking";

export type TrackRepairActionState =
  | { outcome: "found"; view: PublicRepairView }
  | { outcome: "not-found"; message: string }
  | { outcome: "unavailable"; message: string }
  | null;

export async function trackRepairAction(
  _previousState: TrackRepairActionState,
  formData: FormData,
): Promise<TrackRepairActionState> {
  try {
    const view = await lookupRepairByTrackingCode(formData.get("trackingCode"));

    if (!view) {
      return {
        outcome: "not-found",
        message:
          "Repair could not be found. Check Tracking Code and try again.",
      };
    }

    return { outcome: "found", view };
  } catch {
    return {
      outcome: "unavailable",
      message: "Tracking is temporarily unavailable. Please try again later.",
    };
  }
}
