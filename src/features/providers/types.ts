export type ProviderType = "SHOP" | "INDEPENDENT";
export type MembershipRole = "OWNER" | "STAFF";
export type ServiceMode = "DROP_OFF" | "MEETUP" | "HOME_SERVICE" | "OTHER";

export interface ProviderServiceMode {
  mode: ServiceMode;
  details?: string | null;
}

export interface Provider {
  id: string;
  providerType: ProviderType;
  displayName: string;
  slug: string;
  description?: string | null;
  profileImageUrl?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  publicAddress?: string | null;
  serviceArea?: string | null;
  supportedDevices: string[];
  acceptingRequests: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicProviderProfile {
  id: string;
  providerType: ProviderType;
  displayName: string;
  slug: string;
  description?: string | null;
  profileImageUrl?: string | null;
  publicAddress?: string | null;
  serviceArea?: string | null;
  supportedDevices: string[];
  serviceModes: ProviderServiceMode[];
  acceptingRequests: boolean;
  createdAt: string;
}

export interface ProviderUserProfile {
  userId: string;
  displayName: string;
  contactPhone?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderMembership {
  id: string;
  providerId: string;
  userId: string;
  role: MembershipRole;
  createdAt: string;
}

export interface ProviderInvitation {
  id: string;
  providerId: string;
  email: string;
  role: MembershipRole;
  invitedByUserId: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string | null;
  acceptedByUserId?: string | null;
  revokedAt?: string | null;
}

export interface TeamMember {
  membershipId: string;
  userId: string;
  role: MembershipRole;
  displayName: string;
  email: string | null;
  contactPhone?: string | null;
  createdAt: string;
}

export interface CreateProviderInput {
  displayName: string;
  providerType: ProviderType;
  ownerDisplayName?: string;
  ownerContactPhone?: string;
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  publicAddress?: string;
  serviceArea?: string;
  supportedDevices?: string[];
  serviceModes?: ProviderServiceMode[];
  acceptingRequests?: boolean;
}

export interface UpdateProviderProfileInput {
  displayName: string;
  description?: string;
  profileImageUrl?: string;
  contactPhone?: string;
  contactEmail?: string;
  publicAddress?: string;
  serviceArea?: string;
  supportedDevices?: string[];
  acceptingRequests: boolean;
}

export interface UpdateProviderUserProfileInput {
  displayName: string;
  contactPhone?: string;
  avatarUrl?: string;
}

export interface AcceptStaffInvitationInput {
  token: string;
  displayName: string;
  contactPhone?: string;
}

export interface InvitationShopDetails {
  invitationId: string;
  email: string;
  role: "STAFF";
  providerId: string;
  shopName: string;
  publicAddress?: string | null;
  serviceArea?: string | null;
}
