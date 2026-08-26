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

/**
 * Distinguishes expected unauthenticated session errors (e.g. missing or expired token)
 * from infrastructure/network failures (e.g. 500, network down, timeout).
 */
export function isUnauthenticatedAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { name?: string; message?: string; status?: number };

  if (err.name === "AuthSessionMissingError") return true;
  if (err.status === 400 || err.status === 401) return true;

  const msg = (err.message || "").toLowerCase();
  if (
    msg.includes("auth session missing") ||
    msg.includes("session not found") ||
    msg.includes("session_not_found") ||
    msg.includes("jwt") ||
    msg.includes("invalid refresh token") ||
    msg.includes("refresh token not found") ||
    msg.includes("not logged in") ||
    msg.includes("unauthorized")
  ) {
    return true;
  }

  return false;
}
