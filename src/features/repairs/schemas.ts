import { z } from "zod";

import { serviceModeEnum } from "@/features/providers";

const optionalText = (maximum: number, message: string) =>
  z.string().trim().max(maximum, message).optional().or(z.literal(""));

const optionalEmail = z
  .string()
  .trim()
  .email("Please enter a valid email address")
  .max(254, "Email address is too long")
  .optional()
  .or(z.literal(""));

export const requestOriginRepairSchema = z
  .object({
    customerName: z
      .string()
      .trim()
      .min(2, "Customer name must be at least 2 characters")
      .max(120, "Customer name must be 120 characters or fewer"),
    customerPhone: z
      .string()
      .trim()
      .min(3, "Customer phone must be at least 3 characters")
      .max(40, "Customer phone must be 40 characters or fewer"),
    customerEmail: optionalEmail,
    deviceType: z
      .string()
      .trim()
      .min(1, "Device type is required")
      .max(80, "Device type must be 80 characters or fewer"),
    brand: optionalText(80, "Brand must be 80 characters or fewer"),
    model: optionalText(80, "Model must be 80 characters or fewer"),
    serialNumber: optionalText(
      120,
      "Serial number must be 120 characters or fewer",
    ),
    colorVariant: optionalText(
      80,
      "Color or variant must be 80 characters or fewer",
    ),
    deviceSpecs: optionalText(
      1000,
      "Device specifications must be 1,000 characters or fewer",
    ),
    physicalCondition: optionalText(
      2000,
      "Physical condition must be 2,000 characters or fewer",
    ),
    accessoriesReceived: optionalText(
      1000,
      "Accessories received must be 1,000 characters or fewer",
    ),
    reportedProblem: z
      .string()
      .trim()
      .min(1, "Reported Problem is required")
      .max(2000, "Reported Problem must be 2,000 characters or fewer"),
    initialObservation: optionalText(
      2000,
      "Initial observation must be 2,000 characters or fewer",
    ),
    diagnosis: optionalText(
      2000,
      "Diagnosis must be 2,000 characters or fewer",
    ),
    internalNotes: optionalText(
      4000,
      "Internal Notes must be 4,000 characters or fewer",
    ),
    serviceMode: serviceModeEnum
      .optional()
      .or(z.literal(""))
      .transform((value) => value || undefined),
    serviceModeDetails: optionalText(
      240,
      "Service Mode details must be 240 characters or fewer",
    ),
  })
  .superRefine((input, context) => {
    if (!input.serviceMode && input.serviceModeDetails) {
      context.addIssue({
        code: "custom",
        path: ["serviceModeDetails"],
        message: "Select a Service Mode before adding arrangement details",
      });
    }
  });

export type RequestOriginRepairSchemaInput = z.infer<
  typeof requestOriginRepairSchema
>;
