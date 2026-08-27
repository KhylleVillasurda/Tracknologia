import { z } from "zod";

import { serviceModeEnum } from "@/features/providers";

export const trackingCodeSchema = z
  .string()
  .max(128)
  .trim()
  .toUpperCase()
  .regex(/^(TRK-[A-F0-9]{24}|REQ-[A-F0-9]{16})$/);

export const trackingStatusSchema = z.enum([
  "IN_PROGRESS",
  "WAITING_FOR_PARTS",
  "AWAITING_APPROVAL",
  "READY",
  "COMPLETED",
  "SUBMITTED",
  "DECLINED",
]);

export const publicRepairProjectionSchema = z
  .object({
    provider_display_name: z.string().trim().min(1).max(120),
    device_type: z.string().trim().min(1).max(80),
    brand: z.string().max(80).nullable(),
    model: z.string().max(80).nullable(),
    current_status: trackingStatusSchema,
    service_mode: serviceModeEnum.nullable(),
    last_updated_at: z.string().min(1),
    customer_updates: z
      .array(
        z
          .object({
            message: z.string().trim().min(1).max(2000),
            created_at: z.string().min(1),
          })
          .strict(),
      )
      .max(25),
    tracking_type: z.enum(["REPAIR", "REQUEST"]),
    reference_code: z.string().min(1),
  })
  .strict();

export type PublicRepairProjection = z.infer<
  typeof publicRepairProjectionSchema
>;
