import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicRepairView } from "@/features/tracking";

const mocks = vi.hoisted(() => ({
  lookupRepairByTrackingCode: vi.fn(),
  checkRateLimit: vi.fn(),
  recordSuccessfulTrackingView: vi.fn(),
  after: vi.fn((callback: () => Promise<void> | void) => {
    void callback();
  }),
}));

vi.mock("next/server", () => ({
  after: mocks.after,
}));
vi.mock("@/features/analytics", () => ({
  recordSuccessfulTrackingView: mocks.recordSuccessfulTrackingView,
}));
vi.mock("@/features/tracking", () => ({
  lookupRepairByTrackingCode: mocks.lookupRepairByTrackingCode,
}));
vi.mock("@/lib/rate-limit", () => ({
  checkClientRateLimit: mocks.checkRateLimit,
}));

import { trackRepairAction } from "./actions";

const TRACKING_CODE = "  trk-0123456789abcdef01234567  ";
const NORMALIZED_TRACKING_CODE = "TRK-0123456789ABCDEF01234567";

const PUBLIC_VIEW: PublicRepairView = {
  providerDisplayName: "Jacinth Device Care",
  deviceSummary: "Lenovo IdeaPad 3 · Laptop",
  currentStatus: "IN_PROGRESS",
  statusLabel: "In progress",
  statusDescription: "Provider is actively working on your repair.",
  serviceMode: "DROP_OFF",
  serviceModeLabel: "Drop-off",
  handoverMessage: null,
  lastUpdatedAt: "2026-08-24T03:00:00.000Z",
  customerUpdates: [],
  trackingType: "REPAIR",
  trackingCode: NORMALIZED_TRACKING_CODE,
};

function trackingFormData() {
  const formData = new FormData();
  formData.set("trackingCode", TRACKING_CODE);
  return formData;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.checkRateLimit.mockResolvedValue({
    allowed: true,
    retryAfterSeconds: 0,
  });
  mocks.lookupRepairByTrackingCode.mockResolvedValue(PUBLIC_VIEW);
  mocks.recordSuccessfulTrackingView.mockResolvedValue(undefined);
});

describe("trackRepairAction", () => {
  it("returns a successful lookup before deferred Analytics starts", async () => {
    let analyticsInvoked = false;
    mocks.recordSuccessfulTrackingView.mockImplementation(async () => {
      analyticsInvoked = true;
    });

    const result = await trackRepairAction(null, trackingFormData());

    expect(result).toEqual({ outcome: "found", view: PUBLIC_VIEW });
    expect(mocks.lookupRepairByTrackingCode).toHaveBeenCalledWith(
      TRACKING_CODE,
    );
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(analyticsInvoked).toBe(true);
  });

  it("does not schedule Analytics when Tracking is unavailable", async () => {
    mocks.lookupRepairByTrackingCode.mockRejectedValue(
      new Error("database unavailable"),
    );

    const result = await trackRepairAction(null, trackingFormData());

    expect(result).toEqual({
      outcome: "unavailable",
      message: "Tracking is temporarily unavailable. Please try again later.",
    });
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.recordSuccessfulTrackingView).not.toHaveBeenCalled();
  });

  it("does not schedule Analytics when the code does not exist", async () => {
    mocks.lookupRepairByTrackingCode.mockResolvedValue(null);

    const result = await trackRepairAction(null, trackingFormData());

    expect(result).toEqual({
      outcome: "not-found",
      message: "Repair could not be found. Check Tracking Code and try again.",
    });
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.recordSuccessfulTrackingView).not.toHaveBeenCalled();
  });

  it("does not schedule Analytics when rate limited", async () => {
    mocks.checkRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 12,
    });

    const result = await trackRepairAction(null, trackingFormData());

    expect(result).toEqual({
      outcome: "unavailable",
      message:
        "Too many tracking attempts from this connection. Please try again shortly.",
    });
    expect(mocks.lookupRepairByTrackingCode).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.recordSuccessfulTrackingView).not.toHaveBeenCalled();
  });
});
