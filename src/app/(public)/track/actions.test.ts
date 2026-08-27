import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicRepairView } from "@/features/tracking";

const mocks = vi.hoisted(() => ({
  lookupRepairByTrackingCode: vi.fn(),
  checkClientRateLimit: vi.fn(),
  recordSuccessfulTrackingView: vi.fn(),
  after: vi.fn<(callback: () => Promise<void> | void) => void>(),
}));

vi.mock("next/server", () => ({
  after: mocks.after,
}));

vi.mock("@/features/tracking", () => ({
  lookupRepairByTrackingCode: mocks.lookupRepairByTrackingCode,
}));

vi.mock("@/features/analytics", () => ({
  recordSuccessfulTrackingView: mocks.recordSuccessfulTrackingView,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkClientRateLimit: mocks.checkClientRateLimit,
}));

import { trackRepairAction } from "./actions";
import { getProgressEmptyMessage } from "./_components/tracking-form";

const TRACKING_CODE = "  trk-0123456789abcdef01234567  ";
const NORMALIZED_TRACKING_CODE = "TRK-0123456789ABCDEF01234567";

const PUBLIC_VIEW: PublicRepairView = {
  providerDisplayName: "Downtown Repair",
  deviceSummary: "iPhone 13 Pro",
  currentStatus: "IN_PROGRESS",
  statusLabel: "In progress",
  statusDescription: "Device repair is underway.",
  customerUpdates: [],
  lastUpdatedAt: "2026-08-27T10:00:00.000Z",
  serviceMode: "DROP_OFF",
  serviceModeLabel: "Carry-in",
  handoverMessage: null,
  trackingType: "REPAIR",
  trackingCode: NORMALIZED_TRACKING_CODE,
};

function trackingFormData(code: string = TRACKING_CODE) {
  const formData = new FormData();
  formData.set("trackingCode", code);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkClientRateLimit.mockResolvedValue({
    allowed: true,
    retryAfterSeconds: 0,
  });
  mocks.lookupRepairByTrackingCode.mockResolvedValue(PUBLIC_VIEW);
  mocks.recordSuccessfulTrackingView.mockResolvedValue(undefined);
});

describe("trackRepairAction", () => {
  it("returns a successful lookup before deferred Analytics starts", async () => {
    let deferredCallback: (() => Promise<void> | void) | null = null;
    mocks.after.mockImplementation((callback: () => Promise<void> | void) => {
      deferredCallback = callback;
    });

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
    expect(analyticsInvoked).toBe(false);

    if (deferredCallback) {
      await (deferredCallback as () => Promise<void> | void)();
    }
    expect(analyticsInvoked).toBe(true);
    expect(mocks.recordSuccessfulTrackingView).toHaveBeenCalledWith(
      TRACKING_CODE,
    );
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

  it("returns a neutral failure when tracking code is unknown", async () => {
    mocks.lookupRepairByTrackingCode.mockResolvedValue(null);

    const result = await trackRepairAction(null, trackingFormData());

    expect(result).toEqual({
      outcome: "not-found",
      message: "Status could not be found. Check the code and try again.",
    });
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.recordSuccessfulTrackingView).not.toHaveBeenCalled();
  });

  it("returns an unavailable failure when durable abuse control blocks lookup", async () => {
    mocks.checkClientRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 60,
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

describe("getProgressEmptyMessage", () => {
  it("renders review guidance for SUBMITTED requests", () => {
    const msg = getProgressEmptyMessage("SUBMITTED");
    expect(msg).toBe(
      "Your request is awaiting provider review. Updates will appear here once accepted.",
    );
  });

  it("renders terminal decline copy for DECLINED requests and never implies future acceptance", () => {
    const msg = getProgressEmptyMessage("DECLINED");
    expect(msg).toBe(
      "This request was declined. No repair progress updates are available for this request.",
    );
    expect(msg.toLowerCase()).not.toContain("awaiting");
    expect(msg.toLowerCase()).not.toContain("once accepted");
  });

  it("renders public customer updates fallback for active repair states", () => {
    expect(getProgressEmptyMessage("IN_PROGRESS")).toBe(
      "No public customer updates have been posted yet. Check back soon.",
    );
    expect(getProgressEmptyMessage("WAITING_FOR_PARTS")).toBe(
      "No public customer updates have been posted yet. Check back soon.",
    );
    expect(getProgressEmptyMessage("READY")).toBe(
      "No public customer updates have been posted yet. Check back soon.",
    );
    expect(getProgressEmptyMessage("COMPLETED")).toBe(
      "No public customer updates have been posted yet. Check back soon.",
    );
  });
});
