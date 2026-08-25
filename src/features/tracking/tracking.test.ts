import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { lookupRepairByTrackingCode } from "./index";

const TRACKING_CODE = "TRK-0123456789ABCDEF01234567";

function trackingClient(row: Record<string, unknown> | null): {
  client: SupabaseClient;
  rpc: ReturnType<typeof vi.fn>;
} {
  const rpc = vi.fn().mockResolvedValue({
    data: row ? [row] : [],
    error: null,
  });

  return {
    client: { rpc } as unknown as SupabaseClient,
    rpc,
  };
}

function publicProjectionRow(overrides: Record<string, unknown> = {}) {
  return {
    provider_display_name: "Jacinth Device Care",
    device_type: "Laptop",
    brand: "Lenovo",
    model: "IdeaPad 3",
    current_status: "IN_PROGRESS",
    service_mode: "DROP_OFF",
    last_updated_at: "2026-08-24T03:00:00.000Z",
    customer_updates: [
      {
        message: "Replacement part has been installed.",
        created_at: "2026-08-24T02:30:00.000Z",
      },
    ],
    ...overrides,
  };
}

describe("Tracking lookup", () => {
  it("normalizes a Tracking Code and returns only the customer-safe view", async () => {
    const { client, rpc } = trackingClient(publicProjectionRow());

    const result = await lookupRepairByTrackingCode(
      "  trk-0123456789abcdef01234567  ",
      client,
    );

    expect(rpc).toHaveBeenCalledWith("lookup_public_repair", {
      p_tracking_code: TRACKING_CODE,
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(result).toEqual({
      providerDisplayName: "Jacinth Device Care",
      deviceSummary: "Lenovo IdeaPad 3 · Laptop",
      currentStatus: "IN_PROGRESS",
      statusLabel: "In progress",
      statusDescription: "Provider is actively working on your repair.",
      serviceMode: "DROP_OFF",
      serviceModeLabel: "Drop-off",
      handoverMessage: null,
      lastUpdatedAt: "2026-08-24T03:00:00.000Z",
      customerUpdates: [
        {
          message: "Replacement part has been installed.",
          createdAt: "2026-08-24T02:30:00.000Z",
        },
      ],
    });
    expect(result).not.toHaveProperty("customerPhone");
    expect(result).not.toHaveProperty("internalNotes");
    expect(result).not.toHaveProperty("repairId");
    expect(result).not.toHaveProperty("trackingCode");
  });

  it("returns the same not-found result for malformed and unknown codes", async () => {
    const malformed = trackingClient(publicProjectionRow());
    const unknown = trackingClient(null);

    await expect(
      lookupRepairByTrackingCode("TN-2026-00001", malformed.client),
    ).resolves.toBeNull();
    expect(malformed.rpc).not.toHaveBeenCalled();

    await expect(
      lookupRepairByTrackingCode(TRACKING_CODE, unknown.client),
    ).resolves.toBeNull();
    expect(unknown.rpc).toHaveBeenCalledOnce();
  });

  it("rejects oversized raw input before normalization or persistence", async () => {
    const { client, rpc } = trackingClient(publicProjectionRow());
    const oversizedCode = TRACKING_CODE.padStart(129, " ");

    await expect(
      lookupRepairByTrackingCode(oversizedCode, client),
    ).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [
      "IN_PROGRESS",
      "In progress",
      "Provider is actively working on your repair.",
    ],
    [
      "WAITING_FOR_PARTS",
      "Waiting for parts",
      "Work is paused while Provider waits for required parts or materials.",
    ],
    [
      "AWAITING_APPROVAL",
      "Awaiting approval",
      "Provider is waiting for your approval before work continues.",
    ],
    [
      "READY",
      "Ready",
      "Repair work is finished and your device is ready for handover.",
    ],
    ["COMPLETED", "Completed", "Repair and device handover are complete."],
  ])(
    "presents %s with customer-friendly meaning",
    async (currentStatus, statusLabel, statusDescription) => {
      const { client } = trackingClient(
        publicProjectionRow({ current_status: currentStatus }),
      );

      const result = await lookupRepairByTrackingCode(TRACKING_CODE, client);

      expect(result).toMatchObject({
        currentStatus,
        statusLabel,
        statusDescription,
      });
    },
  );

  it.each([
    [
      "DROP_OFF",
      "Your device is ready for pickup. Follow the arrangement agreed with your Provider.",
    ],
    [
      "MEETUP",
      "Your device is ready. Contact your Provider to arrange the agreed meetup.",
    ],
    [
      "HOME_SERVICE",
      "Your device is ready. Follow the home-service arrangement agreed with your Provider.",
    ],
    [
      "OTHER",
      "Your device is ready. Contact your Provider to arrange handover.",
    ],
    [null, "Your device is ready. Contact your Provider to arrange handover."],
  ])(
    "uses Provider-neutral READY wording for %s",
    async (serviceMode, handoverMessage) => {
      const { client } = trackingClient(
        publicProjectionRow({
          current_status: "READY",
          service_mode: serviceMode,
        }),
      );

      const result = await lookupRepairByTrackingCode(TRACKING_CODE, client);

      expect(result?.handoverMessage).toBe(handoverMessage);
    },
  );

  it("fails closed when persistence adds an unexpected public field", async () => {
    const { client, rpc } = trackingClient(
      publicProjectionRow({ internal_notes: "Must never be public" }),
    );

    await expect(
      lookupRepairByTrackingCode(TRACKING_CODE, client),
    ).rejects.toThrow("Public Tracking projection is invalid");
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("fails closed when persistence returns more than 25 updates", async () => {
    const { client, rpc } = trackingClient(
      publicProjectionRow({
        customer_updates: Array.from({ length: 26 }, (_, index) => ({
          message: `Update ${index + 1}`,
          created_at: "2026-08-24T02:30:00.000Z",
        })),
      }),
    );

    await expect(
      lookupRepairByTrackingCode(TRACKING_CODE, client),
    ).rejects.toThrow("Public Tracking projection is invalid");
    expect(rpc).toHaveBeenCalledOnce();
  });
});
