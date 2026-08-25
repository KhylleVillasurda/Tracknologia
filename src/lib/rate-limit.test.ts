import { describe, expect, it } from "vitest";

import { checkRateLimit, rateLimitConfig, resetRateLimits } from "./rate-limit";

describe("checkRateLimit", () => {
  it("allows requests within the configured threshold", () => {
    resetRateLimits();
    const max = rateLimitConfig.tracking_lookup.max;

    for (let i = 0; i < max; i += 1) {
      const result = checkRateLimit("tracking_lookup", "203.0.113.10");
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks the request that exceeds the threshold", () => {
    resetRateLimits();
    const max = rateLimitConfig.tracking_lookup.max;

    for (let i = 0; i < max; i += 1) {
      checkRateLimit("tracking_lookup", "203.0.113.20");
    }

    const result = checkRateLimit("tracking_lookup", "203.0.113.20");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("allows again after the window elapses", () => {
    resetRateLimits();
    const start = Date.now();
    const max = rateLimitConfig.repair_request_submit.max;

    for (let i = 0; i < max; i += 1) {
      checkRateLimit("repair_request_submit", "198.51.100.5", start);
    }
    expect(
      checkRateLimit("repair_request_submit", "198.51.100.5", start).allowed,
    ).toBe(false);

    const afterWindow =
      start + rateLimitConfig.repair_request_submit.windowMs + 1;
    const result = checkRateLimit(
      "repair_request_submit",
      "198.51.100.5",
      afterWindow,
    );
    expect(result.allowed).toBe(true);
  });

  it("isolates operations so one exhausted limit does not affect another", () => {
    resetRateLimits();
    const max = rateLimitConfig.tracking_lookup.max;

    for (let i = 0; i < max; i += 1) {
      checkRateLimit("tracking_lookup", "192.0.2.9");
    }
    expect(checkRateLimit("tracking_lookup", "192.0.2.9").allowed).toBe(false);

    expect(checkRateLimit("repair_request_submit", "192.0.2.9").allowed).toBe(
      true,
    );
  });

  it("isolates identifiers so one limited client does not affect another", () => {
    resetRateLimits();
    const max = rateLimitConfig.tracking_lookup.max;

    for (let i = 0; i < max; i += 1) {
      checkRateLimit("tracking_lookup", "192.0.2.50");
    }
    expect(checkRateLimit("tracking_lookup", "192.0.2.50").allowed).toBe(false);

    expect(checkRateLimit("tracking_lookup", "192.0.2.51").allowed).toBe(true);
  });
});
