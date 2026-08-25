"use server";

import { after } from "next/server";

import { recordSuccessfulTrackingView } from "@/features/analytics";
import {
  lookupRepairByTrackingCode,
  type PublicRepairView,
} from "@/features/tracking";
import { checkRateLimit, resolveClientIdentifier } from "@/lib/rate-limit";

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
    const limit = checkRateLimit(
      "tracking_lookup",
      await resolveClientIdentifier(),
    );

    if (!limit.allowed) {
      return {
        outcome: "unavailable",
        message:
          "Too many tracking attempts from this connection. Please try again shortly.",
      };
    }

    const trackingCode = formData.get("trackingCode");
    const view = await lookupRepairByTrackingCode(trackingCode);

    if (!view) {
      return {
        outcome: "not-found",
        message:
          "Repair could not be found. Check Tracking Code and try again.",
      };
    }

    if (typeof trackingCode === "string") {
      after(() => recordSuccessfulTrackingView(trackingCode));
    }

    return { outcome: "found", view };
  } catch {
    return {
      outcome: "unavailable",
      message: "Tracking is temporarily unavailable. Please try again later.",
    };
  }
}
