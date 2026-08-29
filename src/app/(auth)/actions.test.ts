import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  createClient: vi.fn(),
  redirect: vi.fn(),
  cookies: vi.fn(),
  consoleError: vi.spyOn(console, "error").mockImplementation(() => undefined),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/config/server", () => ({
  getAppOrigin: () => "https://tracknologia.example",
  getServerConfig: () => ({
    runtime: "production",
    auth: { requireEmailConfirmation: true },
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { forgotPasswordAction, registerAction } from "./actions";

function registerFormData() {
  const formData = new FormData();
  formData.set("intent", "SHOP");
  formData.set("email", "owner@shop.com");
  formData.set("password", "password123");
  formData.set("confirmPassword", "password123");
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({
    auth: {
      signUp: mocks.signUp,
      signInWithPassword: mocks.signInWithPassword,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
    },
  });
});

describe("registerAction", () => {
  it("does not expose an unknown production Supabase sentinel", async () => {
    const sentinel = "SUPABASE_SIGNUP_SENTINEL_f829";
    mocks.signUp.mockResolvedValue({
      data: null,
      error: { message: sentinel, status: 503, code: "unexpected_failure" },
    });

    const result = await registerAction(null, registerFormData());

    expect(result).toEqual({
      error:
        "Unable to create your account at this time. Please try again later.",
    });
    expect(JSON.stringify(result)).not.toContain(sentinel);
    expect(mocks.consoleError).toHaveBeenCalledWith(
      "Supabase registration failed",
      expect.objectContaining({ message: sentinel }),
    );
  });

  it("preserves the deliberate existing-account distinction", async () => {
    mocks.signUp.mockResolvedValue({
      data: null,
      error: {
        message: "dependency-specific duplicate text",
        status: 422,
        code: "user_already_exists",
      },
    });

    const result = await registerAction(null, registerFormData());

    expect(result).toEqual({
      error: "An account already exists for this email address.",
    });
  });
});

describe("forgotPasswordAction", () => {
  it("uses exactly the configured production origin for the callback", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    const formData = new FormData();
    formData.set("email", "owner@shop.com");

    const result = await forgotPasswordAction(null, formData);

    expect(result).toEqual({
      success: "Password reset link sent. Please check your email inbox.",
    });
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("owner@shop.com", {
      redirectTo:
        "https://tracknologia.example/auth/callback?next=/reset-password",
    });
  });
});
