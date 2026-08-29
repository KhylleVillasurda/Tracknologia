import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  requireProviderRole: vi.fn(),
  sendStaffInviteEmail: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  consoleError: vi.spyOn(console, "error").mockImplementation(() => undefined),
}));

vi.mock("@/features/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth")>()),
  requireProviderRole: mocks.requireProviderRole,
}));

vi.mock("@/lib/email/client", () => ({
  sendStaffInviteEmail: mocks.sendStaffInviteEmail,
}));

vi.mock("@/lib/config/server", () => ({
  getAppOrigin: () => "https://tracknologia.example",
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { AuthError } from "@/features/auth";
import { inviteStaffAction } from "./actions";

function inviteFormData(email: string) {
  const formData = new FormData();
  formData.set("email", email);
  return formData;
}

function rpcClient(error: Error | null = null): SupabaseClient {
  return {
    rpc: vi.fn().mockResolvedValue({ data: null, error }),
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireProviderRole.mockResolvedValue({
    userId: "owner-1",
    providerId: "provider-1",
    providerName: "Apex Electronics",
    providerType: "SHOP",
    role: "OWNER",
  });
});

describe("inviteStaffAction", () => {
  it("returns a stable temporary failure without exposing the Supabase sentinel", async () => {
    const sentinel = "SUPABASE_RPC_SENTINEL_43f1";
    mocks.createClient.mockResolvedValue(rpcClient(new Error(sentinel)));

    const result = await inviteStaffAction(
      null,
      inviteFormData("tech@shop.com"),
    );

    expect(result).toEqual({
      error:
        "Staff invitations are temporarily unavailable. Please try again later.",
    });
    expect(JSON.stringify(result)).not.toContain(sentinel);
    expect(mocks.consoleError).toHaveBeenCalledWith(
      "Staff invitation creation failed",
      expect.objectContaining({
        name: "StaffInvitationError",
        code: "TEMPORARY_FAILURE",
        cause: expect.objectContaining({
          message: expect.stringContaining(sentinel),
        }),
      }),
    );
  });

  it("keeps invalid input distinguishable at the app-facing seam", async () => {
    const client = rpcClient();
    mocks.createClient.mockResolvedValue(client);

    const result = await inviteStaffAction(null, inviteFormData("not-email"));

    expect(result.error).toBe("Please enter a valid email address to invite");
    expect(result.fieldErrors).toEqual({
      email: "Please enter a valid email address to invite",
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("keeps authorization failure distinct from dependency failure", async () => {
    mocks.createClient.mockResolvedValue(rpcClient());
    mocks.requireProviderRole.mockRejectedValue(
      new AuthError("OWNER role required", "UNAUTHORIZED_ROLE"),
    );

    const result = await inviteStaffAction(
      null,
      inviteFormData("tech@shop.com"),
    );

    expect(result).toEqual({ error: "Only Shop Owners can invite staff" });
  });

  it("keeps recipient eligibility distinct without returning raw RPC text", async () => {
    mocks.createClient.mockResolvedValue(
      rpcClient(
        new Error(
          "Failed to create staff invitation: User already has an active provider membership",
        ),
      ),
    );

    const result = await inviteStaffAction(
      null,
      inviteFormData("member@shop.com"),
    );

    expect(result).toEqual({
      error: "This person already belongs to a Provider and cannot be invited.",
    });
    expect(JSON.stringify(result)).not.toContain("Failed to create");
  });
});
