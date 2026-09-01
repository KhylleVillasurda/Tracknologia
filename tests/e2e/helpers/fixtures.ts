import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

export const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
export const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const LOCAL_TEST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

export function requireE2EConfig(): void {
  const missing = [
    ["NEXT_PUBLIC_SUPABASE_URL", supabaseUrl],
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", supabaseAnonKey],
    ["SUPABASE_SERVICE_ROLE_KEY", supabaseServiceKey],
  ].filter(([, value]) => !value);

  if (missing.length > 0) {
    throw new Error(
      `Missing E2E Supabase configuration: ${missing
        .map(([name]) => name)
        .join(", ")}`,
    );
  }

  // The fixtures create and delete Auth users, Providers, memberships,
  // profiles, Repairs, and Requests via the service-role credential. Running
  // those destructive fixtures against anything but a disposable local
  // Supabase stack is never acceptable, so refuse non-local hosts up front.
  let parsed: URL;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    throw new Error(
      `Invalid NEXT_PUBLIC_SUPABASE_URL for E2E: "${supabaseUrl}". ` +
        "Destructive E2E fixtures require a disposable local Supabase stack " +
        `(allowed hosts: ${[...LOCAL_TEST_HOSTNAMES].join(", ")}).`,
    );
  }
  if (!LOCAL_TEST_HOSTNAMES.has(parsed.hostname)) {
    throw new Error(
      `E2E refuses to run destructive fixtures against "${supabaseUrl}". ` +
        "The E2E suite seeds and deletes test tenants via the service-role " +
        "key, so it must target a disposable local Supabase stack " +
        `(allowed hosts: ${[...LOCAL_TEST_HOSTNAMES].join(", ")}). ` +
        "Start one with `supabase start` and run `pnpm db:reset`.",
    );
  }
}

/** Resolves an Auth user id by email, or returns null when absent. */
export async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) {
    throw new Error(
      `[E2E fixture] could not list users to find ${email}: ${error.message}`,
    );
  }
  const match = data?.users.find((user) => user.email === email);
  return match?.id ?? null;
}

export function createServiceClient(): SupabaseClient {
  requireE2EConfig();
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}.${randomUUID()}@example.test`;
}

export function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().replaceAll("-", "")}`.slice(0, 60);
}

export function uniqueDisplayName(prefix: string): string {
  return `${prefix} ${randomUUID().slice(0, 8)}`;
}

export interface TestActor {
  email: string;
  password: string;
  userId: string;
  providerId: string;
  slug: string;
}

export type SeedOptions = {
  providerType?: "SHOP" | "INDEPENDENT";
  role?: "OWNER" | "STAFF";
  displayName?: string;
  slug?: string;
  serviceModes?: string[];
};

async function assertOk(
  result: { error: { message: string } | null },
  operation: string,
): Promise<void> {
  if (result.error) {
    throw new Error(
      `[E2E fixture] ${operation} failed: ${result.error.message}`,
    );
  }
}

/**
 * Seeds a fully onboarded Provider actor: an auth user, a providers row, a
 * canonical user profile, and an OWNER/STAFF membership. Returns credentials
 * that can be used to sign in through the real UI.
 */
export async function seedActor(
  admin: SupabaseClient,
  opts: SeedOptions = {},
): Promise<TestActor> {
  const email = uniqueEmail("act");
  const password = "TestPassword123!";
  const displayName = opts.displayName ?? uniqueDisplayName("Dale");
  const slug = opts.slug ?? uniqueSlug("provider");

  const { data: userData, error: userError } =
    await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assertOk({ error: userError }, `create user ${email}`);
  const userId = userData.user?.id;
  if (!userId) {
    throw new Error("[E2E fixture] create user returned no id");
  }

  const { data: provider, error: providerError } = await admin
    .from("providers")
    .insert({
      provider_type: opts.providerType ?? "SHOP",
      display_name: displayName,
      slug,
      accepting_requests: true,
    })
    .select("id")
    .single();
  assertOk({ error: providerError }, `create provider ${slug}`);
  if (!provider) {
    throw new Error("[E2E fixture] create provider returned no id");
  }
  const providerId = provider.id as string;

  const { error: profileError } = await admin
    .from("provider_user_profiles")
    .insert({ user_id: userId, display_name: displayName });
  assertOk({ error: profileError }, `create profile for ${email}`);

  const { error: membershipError } = await admin
    .from("provider_memberships")
    .insert({
      provider_id: providerId,
      user_id: userId,
      role: opts.role ?? "OWNER",
    });
  assertOk({ error: membershipError }, `create membership for ${email}`);

  if (opts.serviceModes && opts.serviceModes.length > 0) {
    const { error: modeError } = await admin
      .from("provider_service_modes")
      .insert(
        opts.serviceModes.map((mode) => ({
          provider_id: providerId,
          mode,
        })),
      );
    assertOk({ error: modeError }, `set service modes for ${slug}`);
  }

  return { email, password, userId, providerId, slug };
}

/**
 * Signs in through the real /login UI and returns the persisted storageState
 * so later scenarios reuse the authenticated browser session.
 */
export async function loginAndCaptureState(
  page: Page,
  actor: Pick<TestActor, "email" | "password">,
): Promise<string> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(actor.email);
  await page.locator('input[name="password"]').fill(actor.password);
  await page.getByRole("button", { name: "Sign in to Dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  const statePath = `/tmp/tracknologia-state-${randomUUID()}.json`;
  await page.context().storageState({ path: statePath });
  return statePath;
}

export async function cleanupActors(
  admin: SupabaseClient,
  actorIds: TestActor[],
): Promise<void> {
  if (actorIds.length === 0) {
    return;
  }
  const userIds = actorIds.map((actor) => actor.userId);
  const providerIds = actorIds.map((actor) => actor.providerId);

  const { error: membershipError } = await admin
    .from("provider_memberships")
    .delete()
    .in("user_id", userIds);
  assertOk({ error: membershipError }, "delete fixture memberships");

  const { error: profileError } = await admin
    .from("provider_user_profiles")
    .delete()
    .in("user_id", userIds);
  assertOk({ error: profileError }, "delete fixture profiles");

  // Provider deletion cascades to repairs, repair_requests, status events,
  // customer updates, and tracking observations (committed schema), so the
  // repaired tenants leave no residue once the provider row is gone.
  const { error: providerError } = await admin
    .from("providers")
    .delete()
    .in("id", providerIds);
  assertOk({ error: providerError }, "delete fixture providers");

  for (const actor of actorIds) {
    const { error } = await admin.auth.admin.deleteUser(actor.userId);
    assertOk({ error }, `delete fixture user ${actor.email}`);
  }
}

/** Captures the Tracking Code displayed on the Repair detail page. */
export async function readTrackingCode(page: Page): Promise<string> {
  const dd = page.locator('dt:has-text("Tracking Code") + dd');
  await expect(dd.first()).not.toHaveText("Not provided", { timeout: 10_000 });
  const text = (await dd.first().textContent()) ?? "";
  const match = text.match(/TRK-[A-F0-9]{24}/);
  if (!match) {
    throw new Error(`Could not read a TRK tracking code from: ${text}`);
  }
  return match[0];
}

export interface ServerActionDispatchResult {
  status: number;
  body: string;
  finalUrl: string;
}

/**
 * A real, on-the-wire Server-Action request captured from an enhanced form
 * submission, ready to be replayed byte-for-byte.
 */
export interface CapturedActionRequest {
  url: string;
  headers: Record<string, string>;
  postData: string;
}

/**
 * Replays a real Server-Action request as-is: the identical URL, headers, and
 * body the browser dispatched, executed inside the caller's authenticated page
 * so its session cookies apply. Returns the status and response body so a safe
 * refusal can be asserted directly.
 */
export async function replayActionRequest(
  page: Page,
  captured: CapturedActionRequest,
): Promise<ServerActionDispatchResult> {
  return page.evaluate(async ({ url, headers, postData }) => {
    const cleanHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      const lower = key.toLowerCase();
      if (lower === "content-length" || lower === "host") {
        continue;
      }
      cleanHeaders[key] = value;
    }
    const response = await fetch(url, {
      method: "POST",
      headers: cleanHeaders,
      body: postData,
    });
    return {
      status: response.status,
      body: await response.text(),
      finalUrl: location.href,
    };
  }, captured);
}
