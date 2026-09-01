import {
  expect,
  test,
  type Request as PlaywrightRequest,
} from "@playwright/test";
import {
  createServiceClient,
  replayActionRequest,
  seedActor,
  cleanupActors,
  loginAndCaptureState,
  uniqueDisplayName,
  type CapturedActionRequest,
  type TestActor,
} from "./helpers/fixtures";

test.describe("E2E-02 Customer Request", () => {
  test("customer submits a request and the provider accepts producing exactly one CUSTOMER_REQUEST repair with public tracking and replay resistance", async ({
    browser,
  }) => {
    const admin = createServiceClient();
    const providerName = uniqueDisplayName("Dale");
    const owner: TestActor = await seedActor(admin, {
      providerType: "SHOP",
      displayName: providerName,
      serviceModes: ["DROP_OFF", "MEETUP"],
    });

    const customerPhone = `+63918${Math.floor(10000000 + Math.random() * 89999999)}`;
    const customerName = `Naomi ${Date.now()}`;
    const internalMarker = `INTERNAL NOTE ${Date.now()}`;

    try {
      // 1. Public customer submission (real UI).
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

      // 2. Provider reviews and accepts through the real request UI.
      const providerContext = await browser.newContext();
      const page = await providerContext.newPage();
      await loginAndCaptureState(page, owner);

      await page.goto("/dashboard/requests");
      await page.getByRole("link", { name: "Review Request" }).click();
      await page.waitForURL(/\/dashboard\/requests\/[0-9a-f-]{36}$/);

      // Capture the exact on-the-wire accept request (headers + body) so the
      // very same Server-Action can be replayed after processing.
      const acceptForm = page.locator("form").filter({
        has: page.getByRole("button", { name: "Accept & Create Repair" }),
      });
      await expect(acceptForm).toHaveCount(1);

      let capturedAccept: CapturedActionRequest | null = null;
      const captureAcceptRequest = (request: PlaywrightRequest) => {
        if (
          capturedAccept ||
          !request.headers()["next-action"] ||
          !request.postData()
        ) {
          return;
        }
        capturedAccept = {
          url: request.url(),
          headers: request.headers(),
          postData: request.postData() as string,
        };
      };

      await page.getByLabel("Internal Notes").fill(internalMarker);
      page.on("request", captureAcceptRequest);
      await page
        .getByRole("button", { name: "Accept & Create Repair" })
        .click();
      await expect(page.getByText("ACCEPTED", { exact: true })).toBeVisible({
        timeout: 15_000,
      });
      page.off("request", captureAcceptRequest);
      if (!capturedAccept) {
        throw new Error("[E2E fixture] accept action request was not captured");
      }
      const acceptRequest = capturedAccept;

      // 3. Durable state: acceptance created exactly one authoritative
      //    CUSTOMER_REQUEST Repair starting IN_PROGRESS with a Tracking Code.
      const repairRow = await admin
        .from("repairs")
        .select("id, origin, current_status, tracking_code")
        .eq("repair_request_id", requestId)
        .single();
      expect(repairRow.error).toBeNull();
      expect(repairRow.data).toMatchObject({
        origin: "CUSTOMER_REQUEST",
        current_status: "IN_PROGRESS",
      });
      const trackingCode = repairRow.data?.tracking_code ?? "";
      expect(trackingCode).toMatch(/^TRK-[A-F0-9]{24}$/);

      // 4. Exactly one Repair may exist for this Request.
      const { count, error } = await admin
        .from("repairs")
        .select("id", { count: "exact", head: true })
        .eq("repair_request_id", requestId);
      expect(error).toBeNull();
      expect(count).toBe(1);

      // 5. Public Tracking through the real /track UI, unauthenticated.
      const trackerContext = await browser.newContext();
      const trackerPage = await trackerContext.newPage();
      await trackerPage.goto("/track");
      await trackerPage.getByLabel(/Tracking Code/i).fill(trackingCode);
      await trackerPage.getByRole("button", { name: "Track Status" }).click();
      await expect(trackerPage.getByText(providerName)).toBeVisible();
      await expect(
        trackerPage.getByText("In progress", { exact: true }),
      ).toBeVisible();
      // The public projection must never expose Provider-internal notes.
      await expect(trackerPage.getByText(internalMarker)).not.toBeVisible();
      await trackerContext.close();

      // 6. Replay resistance: re-send the captured acceptance request for the
      //    now processed Request byte-for-byte. The action must refuse and must
      //    not fabricate a second Repair.
      const replayResult = await replayActionRequest(page, acceptRequest);
      expect(replayResult.status).toBeLessThan(500);
      expect(replayResult.body).toContain("already been processed");
      await expect(page.getByText("Request already processed")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Accept & Create Repair" }),
      ).toHaveCount(0);

      const replayRepair = await admin
        .from("repairs")
        .select("origin, current_status")
        .eq("repair_request_id", requestId)
        .single();
      expect(replayRepair.error).toBeNull();
      expect(replayRepair.data).toMatchObject({
        origin: "CUSTOMER_REQUEST",
        current_status: "IN_PROGRESS",
      });

      const replayCount = await admin
        .from("repairs")
        .select("id", { count: "exact", head: true })
        .eq("repair_request_id", requestId);
      expect(replayCount.error).toBeNull();
      expect(replayCount.count).toBe(1);

      await providerContext.close();
    } finally {
      // Provider deletion cascades the Repair and RepairRequest rows.
      await cleanupActors(admin, [owner]);
    }
  });
});
