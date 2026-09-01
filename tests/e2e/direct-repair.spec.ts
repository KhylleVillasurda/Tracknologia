import { expect, test } from "@playwright/test";
import {
  createServiceClient,
  seedActor,
  cleanupActors,
  loginAndCaptureState,
  readTrackingCode,
  type TestActor,
} from "./helpers/fixtures";

test.describe("E2E-01 Direct Repair", () => {
  test("provider creates a direct repair and walks it through to completion with public tracking", async ({
    browser,
  }) => {
    const admin = createServiceClient();
    const actor: TestActor = await seedActor(admin, {
      providerType: "INDEPENDENT",
      serviceModes: ["MEETUP", "HOME_SERVICE"],
    });

    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await loginAndCaptureState(page, actor);

      await page.goto("/dashboard/repairs/new");

      await page.getByLabel("Customer name").fill(`Eva ${Date.now()}`);
      await page.getByLabel("Phone").fill("+639171234567");
      await page.getByLabel("Device type").fill("Laptop");
      await page.getByLabel("Brand").fill("Lenovo");
      await page.getByLabel("Model").fill("ThinkPad X1");
      await page.getByLabel("Reported Problem").fill("No power on battery");

      await page.getByRole("button", { name: "Create Repair" }).click();

      await page.waitForURL(/\/dashboard\/repairs\/[0-9a-f-]{36}$/);
      await expectVisibleStatus(page, "In Progress");

      const trackingCode = await readTrackingCode(page);
      expect(trackingCode).toMatch(/^TRK-[A-F0-9]{24}$/);

      const customerUpdate = `Diagnosis complete update ${Date.now()}`;
      await page.getByLabel("Update message").fill(customerUpdate);
      await page.getByRole("button", { name: "Add Customer Update" }).click();
      await expect(page.getByText(customerUpdate)).toBeVisible();

      // Public Tracking must work while the Repair is active (IN_PROGRESS),
      // not only after terminal completion.
      const activeContext = await browser.newContext();
      const activePage = await activeContext.newPage();
      await activePage.goto("/track");
      await activePage.getByLabel(/Tracking Code/i).fill(trackingCode);
      await activePage.getByRole("button", { name: "Track Status" }).click();
      await expect(
        activePage.getByText("In progress", { exact: true }),
      ).toBeVisible();
      await expect(activePage.getByText(customerUpdate)).toBeVisible();
      await activeContext.close();

      await page.getByRole("button", { name: "Ready", exact: true }).click();
      await expectVisibleStatus(page, "Ready");

      await page.getByRole("button", { name: "Mark Completed" }).click();
      await expectVisibleStatus(page, "Completed");

      await context.close();

      const customerContext = await browser.newContext();
      const customerPage = await customerContext.newPage();
      await customerPage.goto("/track");
      await customerPage.getByLabel(/Tracking Code/i).fill(trackingCode);
      await customerPage.getByRole("button", { name: "Track Status" }).click();

      await expect(customerPage.getByText("Completed")).toBeVisible();
      await expect(customerPage.getByText(customerUpdate)).toBeVisible();
      await customerContext.close();
    } finally {
      await cleanupActors(admin, [actor]);
    }
  });
});

async function expectVisibleStatus(
  page: import("@playwright/test").Page,
  status: string,
): Promise<void> {
  await expect(page.getByText(status, { exact: true }).first()).toBeVisible({
    timeout: 10_000,
  });
}
