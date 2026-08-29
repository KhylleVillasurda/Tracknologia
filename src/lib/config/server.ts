import "server-only";

export type RuntimeEnvironment = "local" | "test" | "production";

export interface ServerConfig {
  runtime: RuntimeEnvironment;
  supabase: {
    url: string;
    publishableKey: string;
    serviceRoleKey: string;
  };
  app: {
    url: string;
    origin: string;
  };
  resend: {
    apiKey: string | null;
    fromEmail: string;
    isDevLogger: boolean;
  };
  publicAbuse: {
    hmacSecret: string;
    trustedProxySecret: string;
    sharedDevBucket: boolean;
  };
  auth: {
    requireEmailConfirmation: boolean;
  };
}

export function resolveRuntimeEnvironment(
  env: Record<string, string | undefined> = process.env,
  explicitRuntime?: RuntimeEnvironment,
): RuntimeEnvironment {
  if (explicitRuntime) {
    return explicitRuntime;
  }
  const appEnv = env.APP_ENV?.toLowerCase().trim();
  const nodeEnv = env.NODE_ENV?.toLowerCase().trim();

  if (appEnv === "production" || appEnv === "staging") {
    return "production";
  }
  if (appEnv === "local" || appEnv === "development") {
    return "local";
  }
  if (appEnv === "test") {
    return "test";
  }

  if (nodeEnv === "test") {
    return "test";
  }

  if (nodeEnv === "production") {
    const rawAppUrl = env.NEXT_PUBLIC_APP_URL?.trim() || "";
    if (
      rawAppUrl.startsWith("http:") ||
      rawAppUrl.includes("localhost") ||
      rawAppUrl.includes("127.0.0.1")
    ) {
      return "local";
    }
    return "production";
  }

  return "local";
}

function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isLoopbackHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower === "::1" ||
    lower === "[::1]" ||
    lower.startsWith("127.")
  );
}

export function parseServerConfig(
  env: Record<string, string | undefined> = process.env,
  overrideRuntime?: RuntimeEnvironment,
): ServerConfig {
  const runtime = resolveRuntimeEnvironment(env, overrideRuntime);

  // 1. App URL & Canonical Origin
  const rawAppUrl = env.NEXT_PUBLIC_APP_URL?.trim();
  if (!rawAppUrl) {
    throw new Error("Configuration error: NEXT_PUBLIC_APP_URL is required.");
  }
  if (!isValidUrl(rawAppUrl)) {
    throw new Error(
      "Configuration error: NEXT_PUBLIC_APP_URL must be a valid absolute URL.",
    );
  }

  const parsedAppUrl = new URL(rawAppUrl);
  if (runtime === "production") {
    if (parsedAppUrl.protocol !== "https:") {
      throw new Error(
        "Configuration error: NEXT_PUBLIC_APP_URL must use HTTPS in production.",
      );
    }
    if (isLoopbackHost(parsedAppUrl.hostname)) {
      throw new Error(
        "Configuration error: NEXT_PUBLIC_APP_URL cannot be localhost or a loopback address in production.",
      );
    }
  }

  const origin = parsedAppUrl.origin;

  // 2. Supabase Configuration
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl || !isValidUrl(supabaseUrl)) {
    throw new Error(
      "Configuration error: NEXT_PUBLIC_SUPABASE_URL must be a valid absolute URL.",
    );
  }

  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!publishableKey) {
    throw new Error(
      "Configuration error: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required and cannot be empty.",
    );
  }

  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    throw new Error(
      "Configuration error: SUPABASE_SERVICE_ROLE_KEY is required for server operations.",
    );
  }

  // 3. Resend Configuration
  const resendApiKey = env.RESEND_API_KEY?.trim() || null;
  const resendFromEmail =
    env.RESEND_FROM_EMAIL?.trim() || "Tracknologia <onboarding@resend.dev>";

  if (runtime === "production") {
    if (!resendApiKey) {
      throw new Error(
        "Configuration error: RESEND_API_KEY is required in production.",
      );
    }
    if (resendFromEmail.includes("onboarding@resend.dev")) {
      throw new Error(
        "Configuration error: RESEND_FROM_EMAIL cannot use default onboarding@resend.dev address in production.",
      );
    }
  }

  const isDevLogger =
    !resendApiKey && (runtime === "local" || runtime === "test");

  // 4. Public-Abuse & Ingress Secrets
  const hmacSecret = env.PUBLIC_ABUSE_HMAC_SECRET?.trim() || "";
  const trustedProxySecret =
    env.PUBLIC_ABUSE_TRUSTED_PROXY_SECRET?.trim() || "";

  if (hmacSecret.length < 32) {
    throw new Error(
      "Configuration error: PUBLIC_ABUSE_HMAC_SECRET must be at least 32 characters long.",
    );
  }
  if (trustedProxySecret.length < 32) {
    throw new Error(
      "Configuration error: PUBLIC_ABUSE_TRUSTED_PROXY_SECRET must be at least 32 characters long.",
    );
  }
  if (hmacSecret === trustedProxySecret) {
    throw new Error(
      "Configuration error: PUBLIC_ABUSE_HMAC_SECRET and PUBLIC_ABUSE_TRUSTED_PROXY_SECRET cannot be identical.",
    );
  }

  const sharedDevBucketRaw =
    env.PUBLIC_ABUSE_SHARED_DEV_BUCKET?.trim().toLowerCase();
  const sharedDevBucket = sharedDevBucketRaw === "true";

  if (runtime === "production" && sharedDevBucket) {
    throw new Error(
      "Configuration error: PUBLIC_ABUSE_SHARED_DEV_BUCKET cannot be enabled in production.",
    );
  }

  // 5. Auth Dev Toggles
  const requireEmailConfirmationRaw =
    env.NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION?.trim().toLowerCase();
  const requireEmailConfirmation = requireEmailConfirmationRaw !== "false";

  if (runtime === "production" && requireEmailConfirmationRaw === "false") {
    throw new Error(
      "Configuration error: NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION cannot be set to false in production.",
    );
  }

  return {
    runtime,
    supabase: {
      url: supabaseUrl,
      publishableKey,
      serviceRoleKey,
    },
    app: {
      url: rawAppUrl,
      origin,
    },
    resend: {
      apiKey: resendApiKey,
      fromEmail: resendFromEmail,
      isDevLogger,
    },
    publicAbuse: {
      hmacSecret,
      trustedProxySecret,
      sharedDevBucket,
    },
    auth: {
      requireEmailConfirmation,
    },
  };
}

export function getServerConfig(): ServerConfig {
  return parseServerConfig(process.env);
}

export function getAppOrigin(): string {
  return getServerConfig().app.origin;
}

export function validateProductionRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): ServerConfig {
  return parseServerConfig(env, "production");
}
