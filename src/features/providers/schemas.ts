import { z } from "zod";

export const providerTypeEnum = z.enum(["SHOP", "INDEPENDENT"]);
export const serviceModeEnum = z.enum([
  "DROP_OFF",
  "MEETUP",
  "HOME_SERVICE",
  "OTHER",
]);

const optionalText = (maximum: number, message: string) =>
  z.string().trim().max(maximum, message).optional().or(z.literal(""));

const optionalEmail = z
  .string()
  .trim()
  .email("Please enter a valid email address")
  .max(254, "Email address is too long")
  .optional()
  .or(z.literal(""));

const optionalUrl = z
  .string()
  .trim()
  .url("Please enter a valid URL")
  .max(2048, "URL is too long")
  .optional()
  .or(z.literal(""));

const supportedDevicesSchema = z
  .array(z.string().trim().min(1).max(80))
  .max(20, "Select at most 20 device categories")
  .default([])
  .transform((devices) => [...new Set(devices)]);

export const providerServiceModeSchema = z.object({
  mode: serviceModeEnum,
  details: optionalText(
    240,
    "Service Mode details must be 240 characters or fewer",
  ),
});

export const providerServiceModesSchema = z
  .array(providerServiceModeSchema)
  .max(4, "Select at most four Service Modes")
  .default([])
  .superRefine((modes, context) => {
    const seen = new Set<string>();
    modes.forEach((mode, index) => {
      if (seen.has(mode.mode)) {
        context.addIssue({
          code: "custom",
          message: `Service Mode ${mode.mode} can only be selected once`,
          path: [index, "mode"],
        });
      }
      seen.add(mode.mode);
    });
  });

const providerOnboardingFields = {
  ownerName: z
    .string()
    .trim()
    .min(2, "Your full name must be at least 2 characters")
    .max(120, "Your full name must be 120 characters or fewer"),
  ownerContactPhone: optionalText(
    40,
    "Your contact phone must be 40 characters or fewer",
  ),
  displayName: z
    .string()
    .trim()
    .min(2, "Provider name must be at least 2 characters")
    .max(120, "Provider name must be 120 characters or fewer"),
  description: optionalText(
    1000,
    "Description must be 1,000 characters or fewer",
  ),
  contactEmail: optionalEmail,
  contactPhone: optionalText(
    40,
    "Provider phone must be 40 characters or fewer",
  ),
  publicAddress: optionalText(
    300,
    "Public address must be 300 characters or fewer",
  ),
  serviceArea: optionalText(
    300,
    "Service Area must be 300 characters or fewer",
  ),
  supportedDevices: supportedDevicesSchema,
  serviceModes: providerServiceModesSchema,
  acceptingRequests: z.boolean().default(true),
};

export const createIndependentProviderSchema = z.object(
  providerOnboardingFields,
);

export const createShopProviderSchema = z.object(providerOnboardingFields);

export const updateProviderProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Provider name must be at least 2 characters")
    .max(120, "Provider name must be 120 characters or fewer"),
  description: providerOnboardingFields.description,
  profileImageUrl: optionalUrl,
  contactEmail: optionalEmail,
  contactPhone: providerOnboardingFields.contactPhone,
  publicAddress: providerOnboardingFields.publicAddress,
  serviceArea: providerOnboardingFields.serviceArea,
  supportedDevices: supportedDevicesSchema,
  acceptingRequests: z.boolean(),
});

export const updateProviderUserProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Your full name must be at least 2 characters")
    .max(120, "Your full name must be 120 characters or fewer"),
  contactPhone: providerOnboardingFields.ownerContactPhone,
  avatarUrl: optionalUrl,
});

export const staffInvitationSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Please enter a valid email address to invite"),
});

export const acceptStaffInvitationSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^inv_[a-f0-9]{48}$/i, "Please enter a valid invitation token"),
  displayName: z
    .string()
    .trim()
    .min(2, "Please enter your full name (at least 2 characters)"),
  contactPhone: z.string().trim().optional(),
});

export const removeStaffMemberSchema = z.object({
  membershipId: z.string().uuid("Invalid team member identifier"),
});

export type CreateIndependentProviderInput = z.infer<
  typeof createIndependentProviderSchema
>;
export type CreateShopProviderInput = z.infer<typeof createShopProviderSchema>;
export type StaffInvitationInput = z.infer<typeof staffInvitationSchema>;
export type AcceptStaffInvitationSchemaInput = z.infer<
  typeof acceptStaffInvitationSchema
>;
export type RemoveStaffMemberSchemaInput = z.infer<
  typeof removeStaffMemberSchema
>;
export type ProviderServiceModeInput = z.infer<
  typeof providerServiceModeSchema
>;
export type UpdateProviderProfileSchemaInput = z.infer<
  typeof updateProviderProfileSchema
>;
export type UpdateProviderUserProfileSchemaInput = z.infer<
  typeof updateProviderUserProfileSchema
>;
