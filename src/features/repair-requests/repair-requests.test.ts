import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  repairRequestListOptionsSchema,
  repairRequestPageSchema,
  submitRepairRequestSchema,
} from "./schemas";
import { listRepairRequestRecords } from "./persistence";

function repairRequestRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    reference_code: `REQ-${String(index).padStart(16, "0")}`,
    customer_name: `Customer ${index}`,
    customer_phone: "09175550101",
    device_type: "Phone",
    brand: null,
    model: null,
    reported_problem: "Screen is blank.",
    status: "SUBMITTED",
    submitted_at: new Date(2026, 0, 1, 0, 0, index).toISOString(),
  }));
}

function listClientReturning(rows: ReturnType<typeof repairRequestRows>) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    range: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);

  return {
    client: {
      from: vi.fn().mockReturnValue(query),
    } as unknown as SupabaseClient,
    query,
  };
}

describe("Repair Request validation", () => {
  it("accepts a lightweight public Request with optional context", () => {
    const result = submitRepairRequestSchema.safeParse({
      customerName: "Juan Dela Cruz",
      customerPhone: "+63 917 555 0101",
      customerEmail: "JUAN@example.com",
      deviceType: "Laptop",
      brand: "Lenovo",
      model: "IdeaPad 3",
      reportedProblem: "Battery no longer charges.",
      problemStartedAt: "Yesterday afternoon",
      preferredServiceMode: "DROP_OFF",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customerName).toBe("Juan Dela Cruz");
      expect(result.data.preferredServiceMode).toBe("DROP_OFF");
    }
  });

  it("rejects invalid public contact and oversized problem input", () => {
    const result = submitRepairRequestSchema.safeParse({
      customerName: "J",
      customerPhone: "1",
      customerEmail: "not-an-email",
      deviceType: "Phone",
      reportedProblem: "x".repeat(2001),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining([
          "customerName",
          "customerPhone",
          "customerEmail",
          "reportedProblem",
        ]),
      );
    }
  });

  it("requires a Service Mode when arrangement details are supplied", () => {
    const result = submitRepairRequestSchema.safeParse({
      customerName: "Juan Dela Cruz",
      customerPhone: "09175550101",
      deviceType: "Phone",
      reportedProblem: "Screen is blank.",
      serviceModeDetails: "Meet near the station",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["serviceModeDetails"]);
    }
  });

  it("accepts supported Request list options and defaults to page 1", () => {
    expect(
      repairRequestListOptionsSchema.safeParse({ status: "SUBMITTED" }).data,
    ).toEqual({ status: "SUBMITTED", page: 1 });
    expect(
      repairRequestListOptionsSchema.safeParse({
        status: "ACCEPTED",
        page: 3,
      }).success,
    ).toBe(true);
    expect(
      repairRequestListOptionsSchema.safeParse({ status: "PENDING" }).success,
    ).toBe(false);
  });

  it("coerces valid URL pages and rejects unsafe page values", () => {
    expect(repairRequestPageSchema.parse("2")).toBe(2);

    for (const page of ["not-a-page", "0", "-1", "1.5", undefined]) {
      expect(repairRequestPageSchema.safeParse(page).success).toBe(false);
    }

    for (const page of [0, -1, 1.5, Number.NaN]) {
      expect(repairRequestListOptionsSchema.safeParse({ page }).success).toBe(
        false,
      );
    }
  });
});

describe("Repair Request pagination persistence", () => {
  it("marks a short first page as having no navigation", async () => {
    const { client, query } = listClientReturning(repairRequestRows(10));

    const result = await listRepairRequestRecords(client, "provider-a", {
      page: 1,
    });

    expect(result.items).toHaveLength(10);
    expect(result.hasPrevious).toBe(false);
    expect(result.hasNext).toBe(false);
    expect(query.range).toHaveBeenCalledWith(0, 25);
  });

  it("fetches one extra row and composes status with page navigation", async () => {
    const { client, query } = listClientReturning(repairRequestRows(26));

    const result = await listRepairRequestRecords(client, "provider-a", {
      status: "SUBMITTED",
      page: 2,
    });

    expect(result.items).toHaveLength(25);
    expect(result.page).toBe(2);
    expect(result.hasPrevious).toBe(true);
    expect(result.hasNext).toBe(true);
    expect(query.eq).toHaveBeenCalledWith("provider_id", "provider-a");
    expect(query.eq).toHaveBeenCalledWith("status", "SUBMITTED");
    expect(query.order).toHaveBeenNthCalledWith(1, "submitted_at", {
      ascending: false,
    });
    expect(query.order).toHaveBeenNthCalledWith(2, "id", {
      ascending: false,
    });
    expect(query.range).toHaveBeenCalledWith(25, 50);
  });

  it("marks a short later page as the final page", async () => {
    const { client, query } = listClientReturning(repairRequestRows(10));

    const result = await listRepairRequestRecords(client, "provider-a", {
      page: 3,
    });

    expect(result.items).toHaveLength(10);
    expect(result.page).toBe(3);
    expect(result.hasPrevious).toBe(true);
    expect(result.hasNext).toBe(false);
    expect(query.range).toHaveBeenCalledWith(50, 75);
  });

  it("queries beyond the former 100-row inbox cap", async () => {
    const { client, query } = listClientReturning(repairRequestRows(4));

    const result = await listRepairRequestRecords(client, "provider-a", {
      page: 5,
    });

    expect(result.items).toHaveLength(4);
    expect(result.hasPrevious).toBe(true);
    expect(result.hasNext).toBe(false);
    expect(query.range).toHaveBeenCalledWith(100, 125);
  });
});
