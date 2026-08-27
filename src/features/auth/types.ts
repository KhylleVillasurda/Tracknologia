export type ProviderRole = "OWNER" | "STAFF";
export type ProviderType = "SHOP" | "INDEPENDENT";

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  userMetadata?: {
    display_name?: string;
    provider_type?: ProviderType;
    [key: string]: unknown;
  };
}

export interface ProviderMembership {
  id: string;
  providerId: string;
  userId: string;
  role: ProviderRole;
  createdAt: string;
}

export interface ProviderContext {
  userId: string;
  providerId: string;
  providerName: string;
  providerType: ProviderType;
  role: ProviderRole;
  email: string | null;
}

export type AuthErrorCode =
  | "UNAUTHENTICATED"
  | "NO_MEMBERSHIP"
  | "AMBIGUOUS_PROVIDER_CONTEXT"
  | "UNAUTHORIZED_ROLE"
  | "INFRASTRUCTURE_FAILURE"
  | "INVALID_CREDENTIALS";

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: AuthErrorCode,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

const KNOWN_UNAUTHENTICATED_ERROR_CODES = new Set([
  "session_not_found",
  "invalid_jwt",
  "bad_jwt",
  "user_not_found",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "invalid_refresh_token",
  "token_expired",
  "session_expired",
]);

/**
 * Distinguishes expected unauthenticated session errors (e.g. missing or expired token)
 * from infrastructure/network failures (e.g. 500, network down, timeout, database connection failure).
 *
 * Fails closed: Unknown codes, generic HTTP 401s without matching known codes, 5xx outages,
 * and database timeouts are classified as INFRASTRUCTURE_FAILURE, never as unauthenticated.
 */
export function isUnauthenticatedAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as {
    name?: string;
    code?: string;
    status?: number;
    message?: string;
  };

  // Explicit session missing error thrown by Supabase SSR / GoTrue when no session cookie exists
  if (err.name === "AuthSessionMissingError") {
    return true;
  }

  // Exact known Supabase auth error codes on the deliberate session-invalid allow-list
  if (
    err.code &&
    KNOWN_UNAUTHENTICATED_ERROR_CODES.has(err.code.toLowerCase())
  ) {
    return true;
  }

  // Strict string checks for GoTrue known session-missing messages when error code is omitted
  const msg = (err.message || "").toLowerCase();
  if (
    msg === "auth session missing!" ||
    msg === "auth session missing" ||
    msg === "session not found" ||
    msg === "invalid refresh token" ||
    msg === "refresh token not found"
  ) {
    return true;
  }

  return false;
}
