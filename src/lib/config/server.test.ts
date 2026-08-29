import { describe, expect, it } from "vitest";
import {
  parseServerConfig,
  resolveRuntimeEnvironment,
  validateProductionRuntimeConfig,
} from "./server";

const VALID_PROD_ENV: Record<string, string> = {
  NODE_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://app.tracknologia.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://xyz.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_pub_123456789012345678901234567890",
  SUPABASE_SERVICE_ROLE_KEY: "sb_service_123456789012345678901234567890",
  RESEND_API_KEY: "re_1234567890",
  RESEND_FROM_EMAIL: "Tracknologia <noreply@tracknologia.com>",
  PUBLIC_ABUSE_HMAC_SECRET: "hmac_secret_32_chars_minimum_length_12345",
  PUBLIC_ABUSE_TRUSTED_PROXY_SECRET:
    "proxy_secret_32_chars_minimum_length_67890",
};

describe("Configuration Seam (src/lib/config/server.ts)", () => {
  describe("Runtime environment resolution", () => {
    it("resolves production when APP_ENV or NODE_ENV is production/staging", () => {
      expect(resolveRuntimeEnvironment({ NODE_ENV: "production" })).toBe(
        "production",
      );
      expect(resolveRuntimeEnvironment({ APP_ENV: "staging" })).toBe(
        "production",
      );
      expect(resolveRuntimeEnvironment({ APP_ENV: "production" })).toBe(
        "production",
      );
    });

    it("resolves test when NODE_ENV is test", () => {
      expect(resolveRuntimeEnvironment({ NODE_ENV: "test" })).toBe("test");
    });

    it("defaults to local for development or unspecified", () => {
      expect(resolveRuntimeEnvironment({ NODE_ENV: "development" })).toBe(
        "local",
      );
      expect(resolveRuntimeEnvironment({})).toBe("local");
    });

    it("respects explicit runtime parameter", () => {
      expect(
        resolveRuntimeEnvironment({ NODE_ENV: "development" }, "production"),
      ).toBe("production");
    });
  });

  describe("Production configuration validation", () => {
    it("passes with complete valid production configuration", () => {
      const config = parseServerConfig(VALID_PROD_ENV, "production");
      expect(config.runtime).toBe("production");
      expect(config.app.origin).toBe("https://app.tracknologia.com");
      expect(config.resend.isDevLogger).toBe(false);
      expect(config.publicAbuse.sharedDevBucket).toBe(false);
    });

    it("executes validateProductionRuntimeConfig without throwing for valid env", () => {
      expect(() =>
        validateProductionRuntimeConfig(VALID_PROD_ENV),
      ).not.toThrow();
    });

    it("fails when NEXT_PUBLIC_APP_URL is missing or invalid", () => {
      expect(() =>
        parseServerConfig(
          { ...VALID_PROD_ENV, NEXT_PUBLIC_APP_URL: "" },
          "production",
        ),
      ).toThrow("NEXT_PUBLIC_APP_URL is required");

      expect(() =>
        parseServerConfig(
          { ...VALID_PROD_ENV, NEXT_PUBLIC_APP_URL: "not-a-url" },
          "production",
        ),
      ).toThrow("NEXT_PUBLIC_APP_URL must be a valid absolute URL");
    });

    it("fails when production app URL uses HTTP or loopback address", () => {
      expect(() =>
        parseServerConfig(
          {
            ...VALID_PROD_ENV,
            NEXT_PUBLIC_APP_URL: "http://app.tracknologia.com",
          },
          "production",
        ),
      ).toThrow("NEXT_PUBLIC_APP_URL must use HTTPS in production");

      expect(() =>
        parseServerConfig(
          { ...VALID_PROD_ENV, NEXT_PUBLIC_APP_URL: "https://localhost:3000" },
          "production",
        ),
      ).toThrow(
        "NEXT_PUBLIC_APP_URL cannot be localhost or a loopback address",
      );

      expect(() =>
        parseServerConfig(
          { ...VALID_PROD_ENV, NEXT_PUBLIC_APP_URL: "https://127.0.0.1:3000" },
          "production",
        ),
      ).toThrow(
        "NEXT_PUBLIC_APP_URL cannot be localhost or a loopback address",
      );
    });

    it("fails when Supabase public or service credentials are missing", () => {
      expect(() =>
        parseServerConfig(
          { ...VALID_PROD_ENV, NEXT_PUBLIC_SUPABASE_URL: "" },
          "production",
        ),
      ).toThrow("NEXT_PUBLIC_SUPABASE_URL must be a valid absolute URL");

      expect(() =>
        parseServerConfig(
          { ...VALID_PROD_ENV, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" },
          "production",
        ),
      ).toThrow("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required");

      expect(() =>
        parseServerConfig(
          { ...VALID_PROD_ENV, SUPABASE_SERVICE_ROLE_KEY: "" },
          "production",
        ),
      ).toThrow("SUPABASE_SERVICE_ROLE_KEY is required");
    });

    it("fails when Resend API key is missing or uses onboarding address in production", () => {
      expect(() =>
        parseServerConfig(
          { ...VALID_PROD_ENV, RESEND_API_KEY: "" },
          "production",
        ),
      ).toThrow("RESEND_API_KEY is required in production");

      expect(() =>
        parseServerConfig(
          {
            ...VALID_PROD_ENV,
            RESEND_FROM_EMAIL: "Tracknologia <onboarding@resend.dev>",
          },
          "production",
        ),
      ).toThrow(
        "RESEND_FROM_EMAIL cannot use default onboarding@resend.dev address in production",
      );
    });

    it("fails when rate-limiting secrets are too short or identical", () => {
      expect(() =>
        parseServerConfig(
          { ...VALID_PROD_ENV, PUBLIC_ABUSE_HMAC_SECRET: "short_secret" },
          "production",
        ),
      ).toThrow("PUBLIC_ABUSE_HMAC_SECRET must be at least 32 characters long");

      expect(() =>
        parseServerConfig(
          {
            ...VALID_PROD_ENV,
            PUBLIC_ABUSE_TRUSTED_PROXY_SECRET: "short_secret",
          },
          "production",
        ),
      ).toThrow(
        "PUBLIC_ABUSE_TRUSTED_PROXY_SECRET must be at least 32 characters long",
      );

      const sameSecret = "identical_secret_32_chars_minimum_length_12345";
      expect(() =>
        parseServerConfig(
          {
            ...VALID_PROD_ENV,
            PUBLIC_ABUSE_HMAC_SECRET: sameSecret,
            PUBLIC_ABUSE_TRUSTED_PROXY_SECRET: sameSecret,
          },
          "production",
        ),
      ).toThrow(
        "PUBLIC_ABUSE_HMAC_SECRET and PUBLIC_ABUSE_TRUSTED_PROXY_SECRET cannot be identical",
      );
    });

    it("fails when development bypass flags are enabled in production", () => {
      expect(() =>
        parseServerConfig(
          { ...VALID_PROD_ENV, PUBLIC_ABUSE_SHARED_DEV_BUCKET: "true" },
          "production",
        ),
      ).toThrow(
        "PUBLIC_ABUSE_SHARED_DEV_BUCKET cannot be enabled in production",
      );

      expect(() =>
        parseServerConfig(
          {
            ...VALID_PROD_ENV,
            NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION: "false",
          },
          "production",
        ),
      ).toThrow(
        "NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION cannot be set to false in production",
      );
    });
  });

  describe("Development / Local mode configuration", () => {
    const VALID_DEV_ENV: Record<string, string> = {
      NODE_ENV: "development",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        "sb_pub_dev_key_32_chars_minimum_len_123",
      SUPABASE_SERVICE_ROLE_KEY: "sb_service_dev_key_32_chars_min_len_123",
      PUBLIC_ABUSE_HMAC_SECRET: "dev_hmac_secret_32_chars_minimum_length_1234",
      PUBLIC_ABUSE_TRUSTED_PROXY_SECRET:
        "dev_proxy_secret_32_chars_minimum_length_5678",
    };

    it("allows localhost URL and missing Resend key in dev mode", () => {
      const config = parseServerConfig(VALID_DEV_ENV, "local");
      expect(config.runtime).toBe("local");
      expect(config.app.origin).toBe("http://localhost:3000");
      expect(config.resend.isDevLogger).toBe(true);
    });

    it("allows dev bucket shortcut and email confirmation bypass in local mode", () => {
      const config = parseServerConfig(
        {
          ...VALID_DEV_ENV,
          PUBLIC_ABUSE_SHARED_DEV_BUCKET: "true",
          NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION: "false",
        },
        "local",
      );
      expect(config.publicAbuse.sharedDevBucket).toBe(true);
      expect(config.auth.requireEmailConfirmation).toBe(false);
    });
  });

  describe("Secret privacy invariant", () => {
    it("never includes secret keys in error messages", () => {
      const secret = "SUPER_SECRET_VALUE_12345678901234567890";
      try {
        parseServerConfig(
          {
            ...VALID_PROD_ENV,
            PUBLIC_ABUSE_HMAC_SECRET: secret,
            PUBLIC_ABUSE_TRUSTED_PROXY_SECRET: secret,
          },
          "production",
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).not.toContain(secret);
      }
    });
  });
});
