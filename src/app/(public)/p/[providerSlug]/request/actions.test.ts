import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  submitRepairRequest: vi.fn(),
}));

vi.mock("@/features/repair-requests", () => ({
  RepairRequestError: class RepairRequestError extends Error {},
  submitRepairRequest: mocks.submitRepairRequest,
  submitRepairRequestSchema: { safeParse: vi.fn() },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkClientRateLimit: mocks.checkRateLimit,
}));

import { submitRepairRequestAction } from "./actions";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("submitRepairRequestAction abuse control", () => {
  it("does not submit when the durable budget is exhausted", async () => {
    mocks.checkRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 30,
    });

    await expect(
      submitRepairRequestAction("provider", null, new FormData()),
    ).resolves.toEqual({
      error: "Too many requests from this connection. Please try again later.",
    });
    expect(mocks.submitRepairRequest).not.toHaveBeenCalled();
  });

  it("returns a safe failure when durable abuse control is unavailable", async () => {
    mocks.checkRateLimit.mockRejectedValue(new Error("database unavailable"));

    await expect(
      submitRepairRequestAction("provider", null, new FormData()),
    ).resolves.toEqual({
      error: "Unable to submit this Repair Request. Please try again.",
    });
    expect(mocks.submitRepairRequest).not.toHaveBeenCalled();
  });
});
