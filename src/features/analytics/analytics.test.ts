import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { recordSuccessfulTrackingView } from "./index";

const TRACKING_CODE = "TRK-0123456789ABCDEF01234567";

function analyticsClient(error: { message: string } | null) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error });

  return {
    client: { rpc } as unknown as SupabaseClient,
    rpc,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Analytics Tracking observation", () => {
  it("records a successful Tracking view through the narrow RPC", async () => {
    const { client, rpc } = analyticsClient(null);

    await expect(
      recordSuccessfulTrackingView(TRACKING_CODE, client),
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("record_successful_tracking_view", {
      p_tracking_code: TRACKING_CODE,
    });
  });

  it("keeps analytics failure best-effort and logs no sensitive input", async () => {
    const { client } = analyticsClient({ message: "private database detail" });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(
      recordSuccessfulTrackingView(TRACKING_CODE, client),
    ).resolves.toBe(false);
    expect(consoleError).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      "Analytics Tracking-view observation failed",
    );
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain(
      TRACKING_CODE,
    );
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain(
      "private database detail",
    );
  });
});
