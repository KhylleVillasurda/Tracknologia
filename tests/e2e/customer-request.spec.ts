import { expect, test } from "@playwright/test";
import {
  createServiceClient,
  seedActor,
  cleanupActors,
  loginAndCaptureState,
  type TestActor,
} from "./helpers/fixtures";

test.describe("E2E-02 Customer Request", () => {
  test("customer submits a request and provider accepts producing exactly one CUSTOMER_REQUEST repair", async ({
    browser,
  }) => {
    const admin = createServiceClient();
    const owner: TestActor = await seedActor(admin, {
      providerType: "SHOP",
      serviceModes: ["DROP_OFF", "MEETUP"],
    });

    const customerPhone = `+63918${Math.floor(10000000 + Math.random() * 89999999)}`;
    const customerName = `Naomi ${Date.now()}`;

    try {
      const customerContext = await browser.newContext();
      const customerPage = await customerContext.newPage();

      await customerPage.goto(`/p/${owner.slug}/request`);
      await customerPage.getByLabel("Full name *").fill(customerName);
      await customerPage.getByLabel("Phone number *").fill(customerPhone);
      await customerPage.getByLabel("Device type *").fill("Smartphone");
      await customerPage.getByLabel("Brand").fill("Samsung");
      await customerPage.getByLabel("Model").fill("Galaxy S24");
      await customerPage
        .getByLabel("What is happening? *")
        .fill("Screen cracked");
      await customerPage
        .getByRole("button", { name: "Submit Repair Request" })
        .click();

      await expect(customerPage.getByText(/REQ-[A-F0-9]{16}/)).toBeVisible({
        timeout: 15_000,
      });
      await customerContext.close();

      const requestRow = await admin
        .from("repair_requests")
        .select("id, reference_code")
        .eq("customer_phone", customerPhone)
        .single();
      expect(requestRow.error).toBeNull();
      const requestId = requestRow.data?.id as string;
      const referenceCode = requestRow.data?.reference_code as string;

      const providerContext = await browser.newContext();
      const page = await providerContext.newPage();
      await loginAndCaptureState(page, owner);

      await page.goto("/dashboard/requests");
      await page.getByRole("link", { name: "Review Request" }).click();
      await page.waitForURL(/\/dashboard\/requests\/[0-9a-f-]{36}$/);

      await page
        .getByRole("button", { name: "Accept & Create Repair" })
        .click();
      await expect(page.getByText("ACCEPTED", { exact: true })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(referenceCode)).toBeVisible();

      await providerContext.close();

      const { count, error } = await admin
        .from("repairs")
        .select("id", { count: "exact", head: true })
        .eq("repair_request_id", requestId);
      expect(error).toBeNull();
      expect(count).toBe(1);
    } finally {
      await cleanupActors(admin, [owner]);
      await admin
        .from("repair_requests")
        .delete()
        .eq("customer_phone", customerPhone);
    }
  });
});
