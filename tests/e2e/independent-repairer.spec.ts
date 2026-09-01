import { expect, test } from "@playwright/test";
import {
  createServiceClient,
  seedActor,
  cleanupActors,
  loginAndCaptureState,
  readTrackingCode,
  type TestActor,
} from "./helpers/fixtures";

test.describe("E2E-04 Independent Repairer", () => {
  test("independent provider operates with Meetup/Home Service and no mandatory shop address", async ({
    browser,
  }) => {
    const admin = createServiceClient();
    const independent: TestActor = await seedActor(admin, {
      providerType: "INDEPENDENT",
      serviceModes: ["MEETUP", "HOME_SERVICE"],
    });

    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await loginAndCaptureState(page, independent);

      await page.goto("/dashboard/repairs/new");
      await page.getByLabel("Customer name").fill(`Rae ${Date.now()}`);
      await page.getByLabel("Phone").fill("+639170000002");
      await page.getByLabel("Device type").fill("Desktop");
      await page.getByLabel("Reported Problem").fill("Will not boot");

      // Independent repairer selects a non-shop service mode (Meetup).
      await page.getByText("Meetup", { exact: true }).click();

      await page.getByRole("button", { name: "Create Repair" }).click();

      await page.waitForURL(/\/dashboard\/repairs\/[0-9a-f-]{36}$/);
      await expect(
        page.getByText("In Progress", { exact: true }),
      ).toBeVisible();

      // No mandatory shop address is enforced for an Independent provider.
      const trackingCode = await readTrackingCode(page);
      expect(trackingCode).toMatch(/^TRK-[A-F0-9]{24}$/);
      await expect(page.getByText("MEETUP", { exact: true })).toBeVisible();

      await context.close();
    } finally {
      await cleanupActors(admin, [independent]);
    }
  });
});
