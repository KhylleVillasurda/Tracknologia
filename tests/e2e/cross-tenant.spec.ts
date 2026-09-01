import { expect, test } from "@playwright/test";
import {
  createServiceClient,
  seedActor,
  cleanupActors,
  loginAndCaptureState,
  type TestActor,
} from "./helpers/fixtures";

test.describe("E2E-05 Cross-tenant", () => {
  test("Provider A cannot read or mutate Provider B's protected repair", async ({
    browser,
  }) => {
    const admin = createServiceClient();
    const providerA: TestActor = await seedActor(admin, {
      providerType: "SHOP",
      serviceModes: ["DROP_OFF"],
    });
    const providerB: TestActor = await seedActor(admin, {
      providerType: "SHOP",
      serviceModes: ["DROP_OFF"],
    });

    const bDevice = `CrossTenant ${Date.now()}`;

    try {
      // 1. Provider B creates a repair through the real UI.
      const contextB = await browser.newContext();
      const pageB = await contextB.newPage();
      await loginAndCaptureState(pageB, providerB);
      await pageB.goto("/dashboard/repairs/new");
      await pageB.getByLabel("Customer name").fill("Tenant B Customer");
      await pageB.getByLabel("Phone").fill("+639170000090");
      await pageB.getByLabel("Device type").fill(bDevice);
      await pageB.getByLabel("Reported Problem").fill("Private B issue");
      await pageB.getByRole("button", { name: "Create Repair" }).click();
      await pageB.waitForURL(/\/dashboard\/repairs\/[0-9a-f-]{36}$/);
      const bRepairUrl = pageB.url();
      const bRepairId = bRepairUrl.split("/").pop() as string;
      await contextB.close();

      // 2. Capture Provider B's durable Repair state before any attack attempt.
      const beforeRow = await admin
        .from("repairs")
        .select("current_status, tracking_code, updated_at")
        .eq("id", bRepairId)
        .single();
      expect(beforeRow.error).toBeNull();
      const before = {
        status: beforeRow.data?.current_status,
        trackingCode: beforeRow.data?.tracking_code,
        updatedAt: beforeRow.data?.updated_at,
      };

      // 3. Provider A attacks through the authenticated application seam.
      const contextA = await browser.newContext();
      const pageA = await contextA.newPage();
      await loginAndCaptureState(pageA, providerA);

      // Provider A must not see B's repair anywhere in its own list.
      await pageA.goto("/dashboard/repairs");
      await expect(pageA.getByText(bDevice)).not.toBeVisible();

      // Direct read attempt through B's repair URL returns the application's
      // neutral 404 (notFound) response, exposing no tenant data and making
      // every mutation control unusable.
      const bRepairResponse = await pageA.goto(bRepairUrl, {
        waitUntil: "domcontentloaded",
      });
      expect(bRepairResponse?.status()).toBe(404);
      await expect(pageA.getByText("Repair identity")).not.toBeVisible();
      await expect(pageA.getByText(bDevice)).not.toBeVisible();
      await expect(
        pageA.getByRole("button", { name: "Mark Completed" }),
      ).toHaveCount(0);
      await expect(
        pageA.getByRole("button", { name: "Ready", exact: true }),
      ).toHaveCount(0);
      await expect(pageA.getByLabel("Update message")).toHaveCount(0);

      await contextA.close();

      // 4. Provider B's durable state must be exactly as captured — no
      //    Provider A-owned side effect was written against B's Repair.
      const afterRow = await admin
        .from("repairs")
        .select("current_status, tracking_code, updated_at")
        .eq("id", bRepairId)
        .single();
      expect(afterRow.error).toBeNull();
      expect({
        status: afterRow.data?.current_status,
        trackingCode: afterRow.data?.tracking_code,
        updatedAt: afterRow.data?.updated_at,
      }).toEqual(before);
    } finally {
      await cleanupActors(admin, [providerA, providerB]);
    }
  });
});
