import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  consoleError: vi.spyOn(console, "error").mockImplementation(() => undefined),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));

vi.mock("@/lib/config/server", () => ({
  getServerConfig: () => ({
    runtime: "production",
    resend: {
      apiKey: "re_production_key",
      fromEmail: "Tracknologia <team@tracknologia.example>",
      isDevLogger: false,
    },
  }),
}));

import { sendEmail } from "./client";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendEmail", () => {
  it("maps an actual Resend adapter rejection to explicit non-success without logging body secrets", async () => {
    const bodySentinel = "INVITATION_TOKEN_BODY_SENTINEL_91d2";
    mocks.send.mockRejectedValue(new Error("Resend unavailable"));

    const result = await sendEmail({
      to: "staff@example.com",
      subject: "Invitation",
      html: `<p>${bodySentinel}</p>`,
      text: bodySentinel,
    });

    expect(result).toEqual({ success: false, reason: "provider_error" });
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining(bodySentinel),
        text: bodySentinel,
      }),
    );
    const logged = mocks.consoleError.mock.calls.flat().join(" ");
    expect(logged).not.toContain(bodySentinel);
  });

  it("maps a Resend provider error response to explicit non-success", async () => {
    mocks.send.mockResolvedValue({
      data: null,
      error: { message: "invalid API key" },
    });

    await expect(
      sendEmail({
        to: "staff@example.com",
        subject: "Invitation",
        html: "<p>Invite</p>",
      }),
    ).resolves.toEqual({ success: false, reason: "provider_error" });
  });
});
