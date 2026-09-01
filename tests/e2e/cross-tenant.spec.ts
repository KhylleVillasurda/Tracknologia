import { expect, test } from "@playwright/test";
import {
  createServiceClient,
  seedActor,
  cleanupActors,
  loginAndCaptureState,
  type TestActor,
} from "./helpers/fixtures";

test.describe("E2E-05 Cross-tenant", () => {
  test("Provider A cannot read Provider B's protected repair", async ({
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
      await contextB.close();

      const contextA = await browser.newContext();
      const pageA = await contextA.newPage();
      await loginAndCaptureState(pageA, providerA);

      // Provider A must not see B's repair anywhere in its own list.
      await pageA.goto("/dashboard/repairs");
      await expect(pageA.getByText(bDevice)).not.toBeVisible();

      // Provider A must not be able to read B's protected repair directly.
      await pageA.goto(bRepairUrl);
      await expect(pageA.getByText("Repair identity")).not.toBeVisible({
        timeout: 10_000,
      });
      await expect(pageA.getByText(bDevice)).not.toBeVisible();

      await contextA.close();
    } finally {
      await cleanupActors(admin, [providerA, providerB]);
    }
  });
});
