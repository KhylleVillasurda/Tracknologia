import { describe, expect, it } from "vitest";

import {
  repairRequestFilterSchema,
  submitRepairRequestSchema,
} from "./schemas";

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

  it("accepts only supported Request status filters", () => {
    expect(
      repairRequestFilterSchema.safeParse({ status: "SUBMITTED" }).success,
    ).toBe(true);
    expect(
      repairRequestFilterSchema.safeParse({ status: "PENDING" }).success,
    ).toBe(false);
  });
});
