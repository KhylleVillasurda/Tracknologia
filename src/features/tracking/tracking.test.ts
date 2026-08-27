import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { lookupRepairByTrackingCode } from "./index";

const TRACKING_CODE = "TRK-0123456789ABCDEF01234567";
const REQUEST_CODE = "REQ-0123456789ABCDEF";

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
    tracking_type: "REPAIR",
    reference_code: TRACKING_CODE,
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
      trackingType: "REPAIR",
      trackingCode: TRACKING_CODE,
    });
    expect(result).not.toHaveProperty("customerPhone");
    expect(result).not.toHaveProperty("internalNotes");
    expect(result).not.toHaveProperty("repairId");
  });

  it("normalizes a Request Reference Code and returns request status view", async () => {
    const { client, rpc } = trackingClient(
      publicProjectionRow({
        current_status: "SUBMITTED",
        customer_updates: [],
        tracking_type: "REQUEST",
        reference_code: REQUEST_CODE,
      }),
    );

    const result = await lookupRepairByTrackingCode(
      "  req-0123456789abcdef  ",
      client,
    );

    expect(rpc).toHaveBeenCalledWith("lookup_public_repair", {
      p_tracking_code: REQUEST_CODE,
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(result).toEqual({
      providerDisplayName: "Jacinth Device Care",
      deviceSummary: "Lenovo IdeaPad 3 · Laptop",
      currentStatus: "SUBMITTED",
      statusLabel: "Request Submitted",
      statusDescription:
        "Provider has received your repair request and is reviewing it. Active repair tracking begins once accepted.",
      serviceMode: "DROP_OFF",
      serviceModeLabel: "Drop-off",
      handoverMessage: null,
      lastUpdatedAt: "2026-08-24T03:00:00.000Z",
      customerUpdates: [],
      trackingType: "REQUEST",
      trackingCode: REQUEST_CODE,
    });
  });

  it("fails closed when persistence returns invalid or corrupt projection schema", async () => {
    // Missing required fields
    const invalidRow = trackingClient({
      provider_display_name: "Jacinth Device Care",
      current_status: "INVALID_STATUS_NAME",
    });

    await expect(
      lookupRepairByTrackingCode(TRACKING_CODE, invalidRow.client),
    ).rejects.toThrow("Public Tracking projection is invalid");

    // More than 25 updates (schema cap)
    const tooManyUpdates = trackingClient(
      publicProjectionRow({
        customer_updates: Array.from({ length: 26 }, (_, i) => ({
          message: `Update ${i}`,
          created_at: "2026-08-24T02:30:00.000Z",
        })),
      }),
    );

    await expect(
      lookupRepairByTrackingCode(TRACKING_CODE, tooManyUpdates.client),
    ).rejects.toThrow("Public Tracking projection is invalid");
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
    [
      "SUBMITTED",
      "Request Submitted",
      "Provider has received your repair request and is reviewing it. Active repair tracking begins once accepted.",
    ],
    [
      "DECLINED",
      "Request Declined",
      "Provider was unable to accept this repair request. Please contact the provider for alternative options.",
    ],
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
  ])(
    "presents specific handover instructions for %s when READY",
    async (serviceMode, handoverMessage) => {
      const { client } = trackingClient(
        publicProjectionRow({
          current_status: "READY",
          service_mode: serviceMode,
        }),
      );

      const result = await lookupRepairByTrackingCode(TRACKING_CODE, client);

      expect(result).toMatchObject({
        currentStatus: "READY",
        serviceMode,
        handoverMessage,
      });
    },
  );
});
