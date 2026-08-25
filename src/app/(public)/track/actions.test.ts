import type { PublicRepairView } from "@/features/tracking";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  headers: vi.fn(),
  lookupRepairByTrackingCode: vi.fn(),
  recordSuccessfulTrackingView: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/features/analytics", () => ({
  recordSuccessfulTrackingView: mocks.recordSuccessfulTrackingView,
}));
vi.mock("@/features/tracking", () => ({
  lookupRepairByTrackingCode: mocks.lookupRepairByTrackingCode,
}));

import { trackRepairAction } from "./actions";
import { resetRateLimits } from "@/lib/rate-limit";

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
};

function trackingFormData() {
  const formData = new FormData();
  formData.set("trackingCode", TRACKING_CODE);
  return formData;
}

beforeEach(() => {
  vi.resetAllMocks();
  resetRateLimits();
  mocks.headers.mockResolvedValue({ get: () => null });
});

describe("trackRepairAction", () => {
  it("returns a successful lookup before deferred Analytics starts", async () => {
    let deferredTask: (() => unknown) | undefined;
    mocks.after.mockImplementation((task: () => unknown) => {
      deferredTask = task;
    });
    mocks.lookupRepairByTrackingCode.mockResolvedValue(PUBLIC_VIEW);
    mocks.recordSuccessfulTrackingView.mockImplementation(
      () => new Promise(() => {}),
    );

    const result = await trackRepairAction(null, trackingFormData());

    expect(result).toEqual({ outcome: "found", view: PUBLIC_VIEW });
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.recordSuccessfulTrackingView).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(NORMALIZED_TRACKING_CODE);

    expect(deferredTask).toBeTypeOf("function");
    deferredTask?.();
    expect(mocks.recordSuccessfulTrackingView).toHaveBeenCalledWith(
      TRACKING_CODE,
    );
  });

  it("does not schedule Analytics for a not-found lookup", async () => {
    mocks.lookupRepairByTrackingCode.mockResolvedValue(null);

    await expect(
      trackRepairAction(null, trackingFormData()),
    ).resolves.toMatchObject({ outcome: "not-found" });
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.recordSuccessfulTrackingView).not.toHaveBeenCalled();
  });

  it("does not schedule Analytics when Tracking is unavailable", async () => {
    mocks.lookupRepairByTrackingCode.mockRejectedValue(
      new Error("database unavailable"),
    );

    await expect(
      trackRepairAction(null, trackingFormData()),
    ).resolves.toMatchObject({ outcome: "unavailable" });
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.recordSuccessfulTrackingView).not.toHaveBeenCalled();
  });
});
