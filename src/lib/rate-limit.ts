import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

import { headers } from "next/headers";
import { z } from "zod";

import { createPublicOperationClient } from "@/lib/supabase/service";

const positiveInteger = z.coerce.number().int().positive();
const rateLimitEnvironmentSchema = z.object({
  PUBLIC_ABUSE_HMAC_SECRET: z.string().min(32),
  PUBLIC_ABUSE_TRACKING_LOOKUP_MAX: positiveInteger.max(10_000).default(30),
  PUBLIC_ABUSE_TRACKING_LOOKUP_WINDOW_SECONDS: positiveInteger
    .max(86_400)
    .default(60),
  PUBLIC_ABUSE_REPAIR_REQUEST_MAX: positiveInteger.max(10_000).default(5),
  PUBLIC_ABUSE_REPAIR_REQUEST_WINDOW_SECONDS: positiveInteger
    .max(86_400)
    .default(600),
});

const trustedProxySecretSchema = z.string().min(32);
const TRUSTED_PROXY_PROOF_HEADER = "x-tracknologia-proxy-secret";
const TRUSTED_CLIENT_IP_HEADER = "x-tracknologia-client-ip";
const LOCAL_DEVELOPMENT_IDENTIFIER = "local-development-shared";
export type RateLimitOperation = "tracking_lookup" | "repair_request_submit";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function getRateLimitConfig() {
  const environment = rateLimitEnvironmentSchema.parse(process.env);

  return {
    secret: environment.PUBLIC_ABUSE_HMAC_SECRET,
    operations: {
      tracking_lookup: {
        windowSeconds: environment.PUBLIC_ABUSE_TRACKING_LOOKUP_WINDOW_SECONDS,
        max: environment.PUBLIC_ABUSE_TRACKING_LOOKUP_MAX,
      },
      repair_request_submit: {
        windowSeconds: environment.PUBLIC_ABUSE_REPAIR_REQUEST_WINDOW_SECONDS,
        max: environment.PUBLIC_ABUSE_REPAIR_REQUEST_MAX,
      },
    },
  } as const;
}

export function createRateLimitActorKey(
  rawIdentifier: string,
  secret: string,
): string {
  return createHmac("sha256", secret).update(rawIdentifier).digest("hex");
}

function constantTimeSecretMatch(expected: string, actual: string): boolean {
  const expectedDigest = createHash("sha256").update(expected).digest();
  const actualDigest = createHash("sha256").update(actual).digest();
  return timingSafeEqual(expectedDigest, actualDigest);
}

export async function resolveClientIdentifier(): Promise<string> {
  if (process.env.PUBLIC_ABUSE_SHARED_DEV_BUCKET === "true") {
    return LOCAL_DEVELOPMENT_IDENTIFIER;
  }

  const proxySecret = trustedProxySecretSchema.safeParse(
    process.env.PUBLIC_ABUSE_TRUSTED_PROXY_SECRET,
  );
  if (!proxySecret.success) {
    throw new Error("Public operation trusted ingress is not configured");
  }

  const headerList = await headers();
  const suppliedProof = headerList.get(TRUSTED_PROXY_PROOF_HEADER) ?? "";
  if (!constantTimeSecretMatch(proxySecret.data, suppliedProof)) {
    throw new Error("Public operation trusted ingress verification failed");
  }

  const clientIp = headerList.get(TRUSTED_CLIENT_IP_HEADER)?.trim() ?? "";
  if (!isIP(clientIp)) {
    throw new Error("Public operation trusted ingress metadata is invalid");
  }

  return clientIp;
}

export async function checkRateLimit(
  operation: RateLimitOperation,
  rawIdentifier: string,
): Promise<RateLimitResult> {
  const config = getRateLimitConfig();
  const policy = config.operations[operation];
  const actorKey = createRateLimitActorKey(rawIdentifier, config.secret);
  const client = await createPublicOperationClient();
  const { data, error } = await client.rpc(
    "check_public_operation_rate_limit",
    {
      p_operation: operation,
      p_actor_key: actorKey,
      p_window_seconds: policy.windowSeconds,
      p_max_requests: policy.max,
      p_cleanup_limit: 100,
    },
  );

  if (error) {
    throw new Error("Public operation abuse control is unavailable", {
      cause: error,
    });
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (
    !row ||
    typeof row.allowed !== "boolean" ||
    typeof row.retry_after_seconds !== "number"
  ) {
    throw new Error(
      "Public operation abuse control returned an invalid result",
    );
  }

  return {
    allowed: row.allowed,
    retryAfterSeconds: row.retry_after_seconds,
  };
}

export async function checkClientRateLimit(
  operation: RateLimitOperation,
): Promise<RateLimitResult> {
  return checkRateLimit(operation, await resolveClientIdentifier());
}
