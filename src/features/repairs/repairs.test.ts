import { describe, expect, it } from "vitest";

import { requestOriginRepairSchema } from "./schemas";

describe("Request-origin Repair validation", () => {
  it("keeps Reported Problem separate from Provider Diagnosis", () => {
    const result = requestOriginRepairSchema.safeParse({
      customerName: "Juan Dela Cruz",
      customerPhone: "09175550101",
      deviceType: "Laptop",
      reportedProblem: "Customer reports random shutdowns.",
      diagnosis: "Battery connector is loose.",
      internalNotes: "Photograph connector before replacement.",
      serviceMode: "DROP_OFF",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reportedProblem).toBe(
        "Customer reports random shutdowns.",
      );
      expect(result.data.diagnosis).toBe("Battery connector is loose.");
    }
  });

  it("rejects Provider intake fields beyond durable bounds", () => {
    const result = requestOriginRepairSchema.safeParse({
      customerName: "Juan Dela Cruz",
      customerPhone: "09175550101",
      deviceType: "Laptop",
      reportedProblem: "Random shutdowns.",
      internalNotes: "x".repeat(4001),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["internalNotes"]);
    }
  });
});
