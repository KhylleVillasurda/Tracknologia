import "server-only";

import { createHash } from "node:crypto";

import { headers } from "next/headers";

// Abuse control for public operations. Safe here because the publishable
// key no longer reaches Postgres directly (see
// supabase/migrations/20260825120000_restrict_public_rpc_grants.sql):
// every public request must pass through this application process.
// State is process-local; scale-out deployment needs a shared-store design
// before thresholds can be trusted across instances.

export const rateLimitConfig = {
  tracking_lookup: { windowMs: 60_000, max: 30 },
  repair_request_submit: { windowMs: 10 * 60_000, max: 5 },
} as const;

export type RateLimitOperation = keyof typeof rateLimitConfig;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function resolveClientIdentifier(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip")?.trim() ||
    "unknown";
  return ip;
}

export function checkRateLimit(
  operation: RateLimitOperation,
  rawIdentifier: string,
  now: number = Date.now(),
): RateLimitResult {
  const config = rateLimitConfig[operation];
  const key = `${operation}:${hashIdentifier(rawIdentifier)}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;

  if (bucket.count > config.max) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimits(): void {
  buckets.clear();
}
