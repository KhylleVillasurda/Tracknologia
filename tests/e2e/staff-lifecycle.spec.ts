import { expect, test } from "@playwright/test";
import {
  createServiceClient,
  seedActor,
  cleanupActors,
  loginAndCaptureState,
  findAuthUserByEmail,
  uniqueEmail,
  type TestActor,
} from "./helpers/fixtures";

test.describe("E2E-06 Staff lifecycle", () => {
  test("owner invites staff, staff joins with limited access, owner removes staff and access is denied", async ({
    browser,
  }) => {
    const admin = createServiceClient();
    const owner: TestActor = await seedActor(admin, {
      providerType: "SHOP",
      serviceModes: ["DROP_OFF"],
    });

    const staffEmail = uniqueEmail("staff");
    const staffPassword = "TestPassword123!";

    try {
      // 1. OWNER creates a staff invitation and captures the invite URL.
      const ownerContext = await browser.newContext();
      const ownerPage = await ownerContext.newPage();
      await loginAndCaptureState(ownerPage, owner);
      await ownerPage.goto("/dashboard/team");

      await ownerPage.getByLabel("Staff Email").fill(staffEmail);
      await ownerPage
        .getByRole("button", { name: "Create Staff Invite" })
        .click();

      const inviteUrlInput = ownerPage.locator(
        'input[value*="register?invite="]',
      );
      await expect(inviteUrlInput).toBeVisible({ timeout: 15_000 });
      const inviteUrl = await inviteUrlInput.inputValue();
      expect(inviteUrl).toMatch(/\/register\?invite=[A-Za-z0-9_-]+$/);

      // 2. STAFF signs up through the shared invite link (real UI).
      const staffContext = await browser.newContext();
      const staffPage = await staffContext.newPage();
      await staffPage.goto(inviteUrl);

      await staffPage.getByLabel("Email Address *").fill(staffEmail);
      await staffPage.locator('input[name="password"]').fill(staffPassword);
      await staffPage
        .locator('input[name="confirmPassword"]')
        .fill(staffPassword);
      await staffPage
        .getByRole("button", { name: "Verify Invite & Create Staff Account" })
        .click();

      // 3. STAFF completes the invited-profile step and lands in the dashboard.
      await staffPage.waitForURL(/\/onboarding/, { timeout: 20_000 });
      await staffPage.getByLabel("Your Full Name *").fill("Mara Staff");
      await staffPage
        .getByRole("button", {
          name: "Complete Profile & Enter Shop Dashboard",
        })
        .click();
      await staffPage.waitForURL(/\/dashboard/, { timeout: 20_000 });
      await expect(
        staffPage.getByText("Dashboard", { exact: true }).first(),
      ).toBeVisible();

      // 4. STAFF has permitted workspace access (Repairs).
      await staffPage.goto("/dashboard/repairs");
      await expect(staffPage).toHaveURL(/\/dashboard\/repairs/);

      // 5. STAFF receives the owner-only denial on an owner-only surface.
      await staffPage.goto("/dashboard/settings");
      await expect(
        staffPage.getByText(
          "Only a Provider Owner can change business and Service Mode settings.",
        ),
      ).toBeVisible();
      await expect(staffPage.getByText("Provider Profile")).not.toBeVisible();

      // 6. STAFF cannot see owner-only team controls.
      await staffPage.goto("/dashboard/team");
      await expect(staffPage).toHaveURL(/\/dashboard\/team/);
      await expect(
        staffPage.getByText("Invite Staff", { exact: true }),
      ).not.toBeVisible();
      await expect(
        staffPage.getByRole("button", { name: "Remove" }),
      ).toHaveCount(0);
      await staffContext.close();

      // 7. OWNER removes the staff member.
      await ownerPage.goto("/dashboard/team");
      await ownerPage.getByRole("button", { name: "Remove" }).first().click();
      await ownerPage.getByRole("button", { name: "Confirm" }).click();
      await expect(ownerPage.getByText(/removed/i)).toBeVisible({
        timeout: 15_000,
      });
      await ownerContext.close();

      // 7. Removed staff member's protected access is denied afterwards.
      const removedContext = await browser.newContext();
      const removedPage = await removedContext.newPage();
      await removedPage.goto("/login");
      await removedPage.locator('input[name="email"]').fill(staffEmail);
      await removedPage.locator('input[name="password"]').fill(staffPassword);
      await removedPage
        .getByRole("button", { name: "Sign in to Dashboard" })
        .click();

      await removedPage.waitForURL(/\/(login|onboarding)/, {
        timeout: 20_000,
      });
      // Navigating to a protected route bounces the removed staff back to login.
      await removedPage.goto("/dashboard/repairs");
      await removedPage.waitForURL(/\/login/, { timeout: 20_000 });
      await expect(removedPage.getByLabel("Email").first()).toBeVisible();
      await removedContext.close();
    } finally {
      await cleanupActors(admin, [owner]);
      const staffUserId = await findAuthUserByEmail(admin, staffEmail);
      if (staffUserId) {
        const { error } = await admin.auth.admin.deleteUser(staffUserId);
        if (error) {
          throw new Error(
            `[E2E fixture] could not delete staff user ${staffEmail}: ${error.message}`,
          );
        }
      }
    }
  });
});
