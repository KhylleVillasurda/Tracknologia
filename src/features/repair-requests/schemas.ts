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

export const providerRequestSlugSchema = z
  .string()
  .trim()
  .min(1, "Provider is required")
  .max(160, "Provider identifier is too long")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Provider identifier is invalid");

export const repairRequestIdSchema = z.uuid("Repair Request ID is invalid");

export const repairRequestStatusEnum = z.enum([
  "SUBMITTED",
  "ACCEPTED",
  "DECLINED",
]);

export const submitRepairRequestSchema = z
  .object({
    customerName: z
      .string()
      .trim()
      .min(2, "Your name must be at least 2 characters")
      .max(120, "Your name must be 120 characters or fewer"),
    customerPhone: z
      .string()
      .trim()
      .min(3, "Phone number must be at least 3 characters")
      .max(40, "Phone number must be 40 characters or fewer"),
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
    reportedProblem: z
      .string()
      .trim()
      .min(1, "Tell the Provider what problem you are experiencing")
      .max(2000, "Reported Problem must be 2,000 characters or fewer"),
    problemStartedAt: optionalText(
      200,
      "Problem timing must be 200 characters or fewer",
    ),
    precedingEvent: optionalText(
      1000,
      "Preceding event must be 1,000 characters or fewer",
    ),
    troubleshootingAttempted: optionalText(
      1000,
      "Troubleshooting details must be 1,000 characters or fewer",
    ),
    additionalInformation: optionalText(
      2000,
      "Additional information must be 2,000 characters or fewer",
    ),
    preferredServiceMode: serviceModeEnum
      .optional()
      .or(z.literal(""))
      .transform((value) => value || undefined),
    serviceModeDetails: optionalText(
      240,
      "Service Mode details must be 240 characters or fewer",
    ),
  })
  .superRefine((input, context) => {
    if (!input.preferredServiceMode && input.serviceModeDetails) {
      context.addIssue({
        code: "custom",
        path: ["serviceModeDetails"],
        message: "Select a preferred Service Mode before adding details",
      });
    }
  });

export const repairRequestPageSchema = z.coerce.number().int().positive();

export const repairRequestListOptionsSchema = z
  .object({
    status: repairRequestStatusEnum.optional(),
    page: z.number().int().positive().default(1),
  })
  .default({ page: 1 });

export type SubmitRepairRequestSchemaInput = z.infer<
  typeof submitRepairRequestSchema
>;
