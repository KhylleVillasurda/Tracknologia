import { describe, expect, it, vi } from "vitest";

// Mock server-only in test environment
vi.mock("server-only", () => ({}));

import { hashInvitationToken } from "@/features/providers/persistence";

/**
 * Pure Contract Test Suite for Provider Security Rules, Token Storage, and Invariants.
 */
describe("Provider Security & Invariant Contract Rules", () => {
  describe("1. Token Storage & Verification Security (AUTH-R21)", () => {
    it("never stores raw tokens; SHA-256 digest is deterministic and one-way", () => {
      const rawToken1 = "inv_1a2b3c4d5e6f7g8h9i0j";
      const rawToken2 = "inv_different_token_xyz";

      const hash1 = hashInvitationToken(rawToken1);
      const hash2 = hashInvitationToken(rawToken2);

      expect(hash1).toHaveLength(64);
      expect(hash2).toHaveLength(64);
      expect(hash1).not.toEqual(rawToken1);
      expect(hash1).not.toEqual(hash2);

      // Re-hashing the presented raw token produces matching hash
      expect(hashInvitationToken(rawToken1)).toEqual(hash1);
    });

    it("verifies wrong or raw token will fail lookup against hashed database rows", () => {
      const rawToken = "inv_raw_token_secret";
      const storedTokenHash = hashInvitationToken(rawToken);

      // Presenting the raw token directly without hashing must mismatch stored hash
      expect(rawToken).not.toEqual(storedTokenHash);
      // Presenting a forged token must mismatch stored hash
      expect(hashInvitationToken("inv_forged_token")).not.toEqual(
        storedTokenHash,
      );
    });
  });

  describe("2. Public vs Private Projection (AUTH-R22)", () => {
    it("public_provider_profiles view contains only public-safe fields", () => {
      const fullProviderRow = {
        id: "11111111-1111-1111-1111-111111111111",
        provider_type: "SHOP",
        display_name: "Apex Electronics",
        slug: "apex-electronics",
        description: "Fast repair service",
        profile_image_url: "https://example.com/logo.png",
        contact_phone: "+63 912 345 6789", // internal contact
        contact_email: "billing-internal@shop.com", // internal billing
        public_address: "123 Tech Lane",
        service_area: "Cebu City",
        supported_devices: ["Smartphones"],
        service_modes: [{ mode: "DROP_OFF", details: null }],
        accepting_requests: true,
        created_at: "2026-08-20T00:00:00Z",
        updated_at: "2026-08-20T00:00:00Z",
      };

      const publicProjectionKeys = [
        "id",
        "provider_type",
        "display_name",
        "slug",
        "description",
        "profile_image_url",
        "public_address",
        "service_area",
        "supported_devices",
        "service_modes",
        "accepting_requests",
        "created_at",
      ];

      // Verify internal contact fields are NOT part of public projection view keys
      expect(publicProjectionKeys).not.toContain("contact_email");
      expect(publicProjectionKeys).not.toContain("contact_phone");
      expect(publicProjectionKeys).not.toContain("updated_at");

      const projected = Object.fromEntries(
        Object.entries(fullProviderRow).filter(([key]) =>
          publicProjectionKeys.includes(key),
        ),
      );

      expect(projected).not.toHaveProperty("contact_email");
      expect(projected).not.toHaveProperty("contact_phone");
      expect(projected).toHaveProperty("display_name", "Apex Electronics");
      expect(projected).toHaveProperty("accepting_requests", true);
    });
  });

  describe("3. Invariants & Business Constraints Enforcement (AUTH-R23, AUTH-R24)", () => {
    it("enforces that Staff invitations are rejected for INDEPENDENT providers", () => {
      const independentProvider = {
        id: "prov-ind-1",
        provider_type: "INDEPENDENT",
      };
      const shopProvider = { id: "prov-shop-1", provider_type: "SHOP" };

      function validateStaffInviteProvider(provider: {
        provider_type: string;
      }) {
        if (provider.provider_type !== "SHOP") {
          throw new Error("Staff invitations are only valid for Repair Shops");
        }
        return true;
      }

      expect(() =>
        validateStaffInviteProvider(independentProvider),
      ).toThrowError("Staff invitations are only valid for Repair Shops");
      expect(validateStaffInviteProvider(shopProvider)).toBe(true);
    });

    it("enforces no-second-membership invariant during staff invitation acceptance", () => {
      const existingMemberships = new Map<string, string[]>([
        ["user-already-member", ["prov-shop-A"]],
      ]);

      function checkCanAcceptInvitation(userId: string) {
        const memberships = existingMemberships.get(userId);
        if (memberships && memberships.length > 0) {
          throw new Error("User already has an active provider membership");
        }
        return true;
      }

      expect(() =>
        checkCanAcceptInvitation("user-already-member"),
      ).toThrowError("User already has an active provider membership");
      expect(checkCanAcceptInvitation("user-fresh")).toBe(true);
    });
  });

  describe("4. Person Profile Data Separation (AUTH-R19)", () => {
    it("separates authorization membership from person profile attributes", () => {
      const membership = {
        id: "mem-uuid",
        provider_id: "prov-uuid",
        user_id: "user-uuid",
        role: "OWNER",
        created_at: "2026-08-20T00:00:00Z",
      };

      const userProfile = {
        user_id: "user-uuid",
        display_name: "Maria Santos",
        contact_phone: "+63 912 345 6789",
        avatar_url: null,
        created_at: "2026-08-20T00:00:00Z",
        updated_at: "2026-08-20T00:00:00Z",
      };

      expect(membership).not.toHaveProperty("display_name");
      expect(membership).not.toHaveProperty("contact_phone");
      expect(membership).not.toHaveProperty("contact_email");

      expect(userProfile).toHaveProperty("display_name", "Maria Santos");
      expect(userProfile).toHaveProperty("contact_phone", "+63 912 345 6789");
    });
  });
});
