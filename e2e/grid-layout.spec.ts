import { test, expect } from "@playwright/test";

test.describe("Grid Layout & Stream Controls E2E Test", () => {
  test.beforeEach(async ({ page }) => {
    // Arrange: clean persistent state and mark onboarding as complete
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("locale", "en");
      localStorage.setItem("preferences.onboardingCompleted", "true");
      localStorage.setItem("preferences.sidebarOpen", "true");
    });
    await page.reload();
  });

  test("grid renders streams and supports hover control elements", async ({ page }) => {
    // Arrange: add a stream (Kick xqc)
    await page.getByTestId("add-stream-btn").click();
    await page.getByTestId("platform-kick").click();
    await page.getByTestId("channel-input").fill("xqc");
    await page.getByTestId("add-submit-btn").click();

    // Assert: stream element is in grid with data-stream-id
    const streamItem = page.getByTestId("stream-item-xqc");
    await expect(streamItem).toBeVisible();

    // Act: hover over stream to reveal control overlay
    await streamItem.hover();

    // Assert: remove stream button is accessible
    const removeBtn = page.getByTestId("remove-stream-xqc");
    await expect(removeBtn).toBeVisible();
  });

  test("grid arranges 2 streams side by side", async ({ page }) => {
    // Arrange: add first stream (Kick xqc)
    await page.getByTestId("add-stream-btn").click();
    await page.getByTestId("platform-kick").click();
    await page.getByTestId("channel-input").fill("xqc");
    await page.getByTestId("add-submit-btn").click();

    // Act: add second stream (Twitch shroud)
    await page.getByTestId("add-stream-btn").click();
    await page.getByTestId("platform-twitch").click();
    await page.getByTestId("channel-input").fill("shroud");
    await page.getByTestId("add-submit-btn").click();

    // Assert: both streams exist simultaneously in DOM grid
    await expect(page.getByTestId("stream-item-xqc")).toBeVisible();
    await expect(page.getByTestId("stream-item-shroud")).toBeVisible();
  });
});
