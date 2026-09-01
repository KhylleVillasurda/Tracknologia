import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
const isCI = Boolean(process.env.CI);

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const missing = requiredEnv.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(
    `Missing E2E environment: ${missing.join(", ")}. ` +
      "Provide Supabase URL/anon(public) keys and the service-role key for the disposable test project.",
  );
}

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL,
    // retries are disabled by policy, so traces must be retained on the actual
    // failing run rather than on an (never-taken) retry.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    // The suite drives real UI flows that require the dev-mode runtime
    // (e.g. E2E-06 registers a staff via the live form, which needs
    // NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION=false — forbidden by a production
    // build). A dev server keeps runtime=local while still exercising the same
    // app and Supabase integration.
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
