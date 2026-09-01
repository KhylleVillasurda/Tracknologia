import { expect, test } from "@playwright/test";
import {
  createServiceClient,
  seedActor,
  cleanupActors,
  loginAndCaptureState,
  readTrackingCode,
  type TestActor,
} from "./helpers/fixtures";

test.describe("E2E-03 One-person Shop", () => {
  test("a single SHOP OWNER completes the full repair workflow with no staff required", async ({
    browser,
  }) => {
    const admin = createServiceClient();
    const owner: TestActor = await seedActor(admin, {
      providerType: "SHOP",
      serviceModes: ["DROP_OFF"],
    });

    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await loginAndCaptureState(page, owner);

      await page.goto("/dashboard/repairs/new");
      await page.getByLabel("Customer name").fill(`Solo ${Date.now()}`);
      await page.getByLabel("Phone").fill("+639170000001");
      await page.getByLabel("Device type").fill("Tablet");
      await page.getByLabel("Reported Problem").fill("No display");
      await page.getByRole("button", { name: "Create Repair" }).click();

      await page.waitForURL(/\/dashboard\/repairs\/[0-9a-f-]{36}$/);
      await expect(
        page.getByText("In Progress", { exact: true }),
      ).toBeVisible();

      const trackingCode = await readTrackingCode(page);
      expect(trackingCode).toMatch(/^TRK-[A-F0-9]{24}$/);

      // No staff/technician assignment is ever required to advance the lifecycle.
      await page.getByRole("button", { name: "Ready", exact: true }).click();
      await expect(page.getByText("Ready", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Mark Completed" }).click();
      await expect(page.getByText("Completed", { exact: true })).toBeVisible();

      await context.close();
    } finally {
      await cleanupActors(admin, [owner]);
    }
  });
});
