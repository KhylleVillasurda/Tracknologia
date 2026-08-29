import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPublicOperationClient: vi.fn(),
  headers: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/supabase/service", () => ({
  createPublicOperationClient: mocks.createPublicOperationClient,
}));

import {
  checkRateLimit,
  createRateLimitActorKey,
  getRateLimitConfig,
  resolveClientIdentifier,
} from "./rate-limit";

const SECRET = "test-only-secret-with-at-least-32-characters";
const PROXY_SECRET = "test-only-proxy-proof-with-at-least-32-characters";

beforeEach(() => {
  vi.resetAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
    "sb_pub_test_123456789012345678901234567890";
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    "sb_service_test_123456789012345678901234567890";
  process.env.PUBLIC_ABUSE_HMAC_SECRET = SECRET;
  process.env.PUBLIC_ABUSE_TRUSTED_PROXY_SECRET = PROXY_SECRET;
  delete process.env.PUBLIC_ABUSE_SHARED_DEV_BUCKET;
  delete process.env.PUBLIC_ABUSE_TRACKING_LOOKUP_MAX;
  delete process.env.PUBLIC_ABUSE_TRACKING_LOOKUP_WINDOW_SECONDS;
  delete process.env.PUBLIC_ABUSE_REPAIR_REQUEST_MAX;
  delete process.env.PUBLIC_ABUSE_REPAIR_REQUEST_WINDOW_SECONDS;
  mocks.createPublicOperationClient.mockResolvedValue({ rpc: mocks.rpc });
});

describe("durable public-operation abuse control", () => {
  it("uses validated server-side defaults", () => {
    expect(getRateLimitConfig().operations).toEqual({
      tracking_lookup: { max: 30, windowSeconds: 60 },
      repair_request_submit: { max: 5, windowSeconds: 600 },
    });
  });

  it("rejects a missing or weak keyed-digest secret", () => {
    delete process.env.PUBLIC_ABUSE_HMAC_SECRET;
    expect(() => getRateLimitConfig()).toThrow();

    process.env.PUBLIC_ABUSE_HMAC_SECRET = "too-short";
    expect(() => getRateLimitConfig()).toThrow();
  });

  it("accepts bounded threshold overrides and rejects invalid values", () => {
    process.env.PUBLIC_ABUSE_TRACKING_LOOKUP_MAX = "12";
    process.env.PUBLIC_ABUSE_TRACKING_LOOKUP_WINDOW_SECONDS = "45";
    expect(getRateLimitConfig().operations.tracking_lookup).toEqual({
      max: 12,
      windowSeconds: 45,
    });

    process.env.PUBLIC_ABUSE_TRACKING_LOOKUP_MAX = "0";
    expect(() => getRateLimitConfig()).toThrow();
  });

  it("persists only an opaque HMAC actor key through the atomic RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ allowed: true, retry_after_seconds: 0 }],
      error: null,
    });

    await expect(
      checkRateLimit("tracking_lookup", "203.0.113.10"),
    ).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });

    expect(mocks.rpc).toHaveBeenCalledWith(
      "check_public_operation_rate_limit",
      expect.objectContaining({
        p_operation: "tracking_lookup",
        p_actor_key: expect.stringMatching(/^[0-9a-f]{64}$/),
        p_window_seconds: 60,
        p_max_requests: 30,
        p_cleanup_limit: 100,
      }),
    );
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("203.0.113.10");
  });

  it("uses a keyed digest rather than a reproducible unkeyed hash", () => {
    const identifier = "198.51.100.5";
    expect(createRateLimitActorKey(identifier, SECRET)).not.toBe(
      createRateLimitActorKey(identifier, `${SECRET}-different`),
    );
  });

  it("returns a durable denial and fails closed when control is unavailable", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{ allowed: false, retry_after_seconds: 42 }],
      error: null,
    });
    await expect(
      checkRateLimit("repair_request_submit", "198.51.100.5"),
    ).resolves.toEqual({ allowed: false, retryAfterSeconds: 42 });

    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: new Error("database unavailable"),
    });
    await expect(
      checkRateLimit("repair_request_submit", "198.51.100.5"),
    ).rejects.toThrow("abuse control is unavailable");
  });

  it("accepts a client IP only from a proven trusted ingress", async () => {
    process.env.PUBLIC_ABUSE_TRUSTED_PROXY_SECRET = PROXY_SECRET;
    mocks.headers.mockResolvedValue({
      get: (name: string) => {
        if (name === "x-tracknologia-proxy-secret") return PROXY_SECRET;
        if (name === "x-tracknologia-client-ip") return "203.0.113.10";
        return null;
      },
    });
    await expect(resolveClientIdentifier()).resolves.toBe("203.0.113.10");
  });

  it("rejects missing, spoofed, or invalid ingress metadata", async () => {
    delete process.env.PUBLIC_ABUSE_TRUSTED_PROXY_SECRET;
    await expect(resolveClientIdentifier()).rejects.toThrow();

    process.env.PUBLIC_ABUSE_TRUSTED_PROXY_SECRET = PROXY_SECRET;
    mocks.headers.mockResolvedValue({
      get: (name: string) =>
        name === "x-tracknologia-client-ip" ? "203.0.113.10" : null,
    });
    await expect(resolveClientIdentifier()).rejects.toThrow(
      "trusted ingress verification failed",
    );

    mocks.headers.mockResolvedValue({
      get: (name: string) => {
        if (name === "x-tracknologia-proxy-secret") return "attacker-value";
        if (name === "x-tracknologia-client-ip") return "203.0.113.10";
        return null;
      },
    });
    await expect(resolveClientIdentifier()).rejects.toThrow(
      "trusted ingress verification failed",
    );

    mocks.headers.mockResolvedValue({
      get: (name: string) => {
        if (name === "x-tracknologia-proxy-secret") return PROXY_SECRET;
        if (name === "x-tracknologia-client-ip") return "not-an-ip";
        return null;
      },
    });
    await expect(resolveClientIdentifier()).rejects.toThrow(
      "trusted ingress metadata is invalid",
    );
  });

  it("shares one bucket only through the explicit local opt-in and ignores spoofable forwarding headers", async () => {
    process.env.PUBLIC_ABUSE_SHARED_DEV_BUCKET = "true";
    mocks.headers.mockResolvedValue({
      get: vi.fn().mockReturnValue("198.51.100.99"),
    });

    await expect(resolveClientIdentifier()).resolves.toBe(
      "local-development-shared",
    );
    expect(mocks.headers).not.toHaveBeenCalled();
  });

  it("fails closed without ingress proof unless the local shared bucket is opted in", async () => {
    delete process.env.PUBLIC_ABUSE_TRUSTED_PROXY_SECRET;
    mocks.headers.mockResolvedValue({
      get: vi.fn().mockReturnValue("198.51.100.99"),
    });

    await expect(resolveClientIdentifier()).rejects.toThrow();
  });
});
