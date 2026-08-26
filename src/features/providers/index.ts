// Public Interface for src/features/providers
export {
  createProvider,
  createStaffInvitation,
  acceptStaffInvitation,
  revokeStaffInvitation,
  removeStaffMember,
  setServiceModes,
  updateCurrentProviderUserProfile,
  updateProviderProfile,
  type CreateStaffInvitationResult,
  type RemoveStaffMemberResult,
} from "./commands";

export {
  getProvider,
  getPublicProvider,
  getInvitationForOnboarding,
  listTeamMembers,
  listPendingStaffInvitations,
  getProviderUserProfile,
  getProviderServiceModes,
} from "./queries";

export {
  providerTypeEnum,
  serviceModeEnum,
  providerServiceModeSchema,
  providerServiceModesSchema,
  createIndependentProviderSchema,
  createShopProviderSchema,
  staffInvitationSchema,
  acceptStaffInvitationSchema,
  removeStaffMemberSchema,
  updateProviderProfileSchema,
  updateProviderUserProfileSchema,
  type CreateIndependentProviderInput,
  type CreateShopProviderInput,
  type StaffInvitationInput,
  type AcceptStaffInvitationSchemaInput,
  type RemoveStaffMemberSchemaInput,
  type ProviderServiceModeInput,
  type UpdateProviderProfileSchemaInput,
  type UpdateProviderUserProfileSchemaInput,
} from "./schemas";

export type {
  Provider,
  PublicProviderProfile,
  ProviderUserProfile,
  ProviderMembership,
  ProviderInvitation,
  ProviderType,
  MembershipRole,
  ServiceMode,
  ProviderServiceMode,
  TeamMember,
  CreateProviderInput,
  UpdateProviderProfileInput,
  UpdateProviderUserProfileInput,
  AcceptStaffInvitationInput,
  InvitationShopDetails,
} from "./types";
