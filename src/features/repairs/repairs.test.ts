import { describe, expect, it } from "vitest";

import {
  customerUpdateSchema,
  directRepairSchema,
  repairListOptionsSchema,
  requestOriginRepairSchema,
  updateRepairDetailsSchema,
} from "./schemas";
import { getAllowedRepairStatusTransitions } from "./types";

const validRepairInput = {
  customerName: "Juan Dela Cruz",
  customerPhone: "09175550101",
  deviceType: "Laptop",
  reportedProblem: "Customer reports random shutdowns.",
  serviceMode: "DROP_OFF" as const,
};

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

describe("Provider-created Repair validation", () => {
  it("accepts the same authoritative snapshot without a Repair Request", () => {
    const result = directRepairSchema.safeParse({
      ...validRepairInput,
      initialObservation: "Battery connector feels loose.",
      diagnosis: "Battery connector is damaged.",
    });

    expect(result.success).toBe(true);
  });

  it("requires Service Mode before arrangement details", () => {
    const result = directRepairSchema.safeParse({
      ...validRepairInput,
      serviceMode: undefined,
      serviceModeDetails: "Meet near the town hall",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["serviceModeDetails"]);
    }
  });

  it("uses the same durable bounds for later detail edits", () => {
    const result = updateRepairDetailsSchema.safeParse({
      ...validRepairInput,
      diagnosis: "x".repeat(2001),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["diagnosis"]);
    }
  });

  it("distinguishes an omitted Service Mode from an intentional clear", () => {
    const preserved = updateRepairDetailsSchema.safeParse({
      ...validRepairInput,
      serviceMode: undefined,
    });
    const cleared = updateRepairDetailsSchema.safeParse({
      ...validRepairInput,
      serviceMode: null,
      serviceModeDetails: "",
    });

    expect(preserved.success).toBe(true);
    expect(cleared.success).toBe(true);
    if (cleared.success) {
      expect(cleared.data.serviceMode).toBeNull();
    }
  });
});

describe("Repair lifecycle", () => {
  it("returns only the allowed next statuses for every lifecycle state", () => {
    expect(getAllowedRepairStatusTransitions("IN_PROGRESS")).toEqual([
      "WAITING_FOR_PARTS",
      "AWAITING_APPROVAL",
      "READY",
    ]);
    expect(getAllowedRepairStatusTransitions("WAITING_FOR_PARTS")).toEqual([
      "IN_PROGRESS",
    ]);
    expect(getAllowedRepairStatusTransitions("AWAITING_APPROVAL")).toEqual([
      "IN_PROGRESS",
    ]);
    expect(getAllowedRepairStatusTransitions("READY")).toEqual(["COMPLETED"]);
    expect(getAllowedRepairStatusTransitions("COMPLETED")).toEqual([]);
  });
});

describe("Repair list and Customer Update validation", () => {
  it("normalizes safe list options and defaults to page 1", () => {
    const result = repairListOptionsSchema.safeParse({
      status: "READY",
      query: "TN-2026 Laptop",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        status: "READY",
        query: "TN-2026 Laptop",
        page: 1,
      });
    }
  });

  it("bounds search input without rejecting punctuation", () => {
    expect(
      repairListOptionsSchema.safeParse({ query: "name),id.eq.*" }).success,
    ).toBe(true);
    expect(
      repairListOptionsSchema.safeParse({ query: "x".repeat(81) }).success,
    ).toBe(false);
  });

  it("accepts ordinary punctuation in customer and device searches", () => {
    for (const query of ["O'Connor", "Galaxy S23+", "AT&T", "A/B"]) {
      expect(repairListOptionsSchema.safeParse({ query }).success).toBe(true);
    }
  });

  it("accepts the aggregate Waiting Repair filter", () => {
    const result = repairListOptionsSchema.safeParse({ status: "WAITING" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("WAITING");
    }
  });

  it("requires a bounded nonblank Customer Update", () => {
    expect(
      customerUpdateSchema.safeParse({ message: "Repair is progressing." })
        .success,
    ).toBe(true);
    expect(customerUpdateSchema.safeParse({ message: "   " }).success).toBe(
      false,
    );
    expect(
      customerUpdateSchema.safeParse({ message: "x".repeat(2001) }).success,
    ).toBe(false);
  });
});
