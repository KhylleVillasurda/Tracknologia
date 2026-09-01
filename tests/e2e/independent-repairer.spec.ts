import { expect, test } from "@playwright/test";
import {
  createServiceClient,
  cleanupActors,
  findAuthUserByEmail,
  uniqueEmail,
  uniqueDisplayName,
  type TestActor,
} from "./helpers/fixtures";

test.describe("E2E-04 Independent Repairer", () => {
  test("independent provider registers and onboards through the real UI with Meetup/Home Service and no mandatory shop address", async ({
    browser,
  }) => {
    const admin = createServiceClient();
    const indEmail = uniqueEmail("ind");
    const indPassword = "TestPassword123!";
    const displayName = uniqueDisplayName("Mae");

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // 1. Real registration as an Independent Provider (no pre-seeded Provider).
      await page.goto("/register");
      await page.getByRole("radio", { name: "Independent" }).click();
      await page.locator('input[name="email"]').fill(indEmail);
      await page.locator('input[name="password"]').fill(indPassword);
      await page.locator('input[name="confirmPassword"]').fill(indPassword);
      await page
        .getByRole("button", { name: "Create Account & Continue" })
        .click();

      // Registration redirects into onboarding because no Provider exists yet.
      await page.waitForURL(/\/onboarding/, { timeout: 20_000 });
      await expect(
        page.getByText("Set Up Your Independent Profile"),
      ).toBeVisible();

      // 2. The Independent flow has no mandatory shop address.
      await expect(page.getByText("Repair Shop Profile")).not.toBeVisible();
      const addressField = page.getByLabel("Public Address (Optional)");
      await expect(addressField).toBeVisible();
      expect(await addressField.getAttribute("required")).toBeNull();

      // 3. Configure Service Area + MEETUP/HOME_SERVICE and leave the address blank.
      await page.getByLabel("Your Full Name *").fill("Mae Martinez");
      await page
        .getByLabel(/Repair Brand \/ Business Name \*/)
        .fill(displayName);
      await page.getByLabel("Service Area (Optional)").fill("Metro Cebu");
      await page.locator('input[name="serviceModes"][value="MEETUP"]').check();
      await page
        .locator('input[name="serviceModes"][value="HOME_SERVICE"]')
        .check();
      await page
        .getByRole("button", { name: "Complete Setup & Go to Dashboard" })
        .click();

      await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

      // 4. Durable Provider state proves onboarding saved the configuration.
      const userId = await findAuthUserByEmail(admin, indEmail);
      expect(userId).toBeTruthy();

      const membershipRow = await admin
        .from("provider_memberships")
        .select("provider_id")
        .eq("user_id", userId!)
        .single();
      expect(membershipRow.error).toBeNull();
      const providerId = membershipRow.data?.provider_id as string;

      const providerRow = await admin
        .from("providers")
        .select("provider_type, service_area")
        .eq("id", providerId)
        .single();
      expect(providerRow.error).toBeNull();
      expect(providerRow.data?.provider_type).toBe("INDEPENDENT");
      expect(providerRow.data?.service_area).toBe("Metro Cebu");

      const modesRow = await admin
        .from("provider_service_modes")
        .select("mode")
        .eq("provider_id", providerId);
      expect(modesRow.error).toBeNull();
      expect(modesRow.data?.map((row) => row.mode)).toEqual(
        expect.arrayContaining(["MEETUP", "HOME_SERVICE"]),
      );

      // 5. Normal post-onboarding Repair operation with a non-shop mode.
      await page.goto("/dashboard/repairs/new");
      await page.getByLabel("Customer name").fill(`Rae ${Date.now()}`);
      await page.getByLabel("Phone").fill("+639170000002");
      await page.getByLabel("Device type").fill("Desktop");
      await page.getByLabel("Reported Problem").fill("Will not boot");
      await page.locator('input[name="serviceMode"][value="MEETUP"]').check();
      await page.getByRole("button", { name: "Create Repair" }).click();

      await page.waitForURL(/\/dashboard\/repairs\/[0-9a-f-]{36}$/);
      await expect(
        page.getByText("In Progress", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText("MEETUP", { exact: true })).toBeVisible();
    } finally {
      await context.close();

      const userId = await findAuthUserByEmail(admin, indEmail);
      if (userId) {
        const membershipRow = await admin
          .from("provider_memberships")
          .select("provider_id")
          .eq("user_id", userId)
          .single();
        const providerId = membershipRow.data?.provider_id as
          string | undefined;
        const actor: TestActor = {
          email: indEmail,
          password: indPassword,
          userId,
          providerId: providerId ?? "",
          slug: "",
        };
        await cleanupActors(admin, [actor]);
      }
    }
  });
});
