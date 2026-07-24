import { test, expect } from "@playwright/test";

test.describe("Stream lifecycle E2E Test", () => {
  test.beforeEach(async ({ page }) => {
    // Arrange: clean persistent state and mark onboarding as complete
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("locale", "en");
      localStorage.setItem("preferences.onboardingCompleted", "true");
      localStorage.setItem("preferences.sidebarOpen", "true");
    });
    // Reload to apply localStorage changes
    await page.reload();
  });

  test("add a Kick stream -> appears in grid -> remove it", async ({ page }) => {
    // Arrange: verify EmptyState is visible
    await expect(page.getByTestId("empty-state")).toBeVisible();

    // Act: open AddDialog via sidebar button
    await page.getByTestId("add-stream-btn").click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Act: select Kick and type channel
    await page.getByTestId("platform-kick").click();
    await page.getByTestId("channel-input").fill("xqc");
    await page.getByTestId("add-submit-btn").click();

    // Assert: stream appears in grid
    await expect(page.getByTestId("empty-state")).not.toBeVisible();
    const streamItem = page.getByTestId("stream-item-xqc");
    await expect(streamItem).toBeVisible();

    // Wait for stream skeleton loading overlay (3s) to fade out before interacting
    await page.waitForTimeout(3500);

    // Act: hover over stream item to trigger controls and click remove
    await streamItem.hover();
    const removeBtn = page.getByTestId("remove-stream-xqc");
    await expect(removeBtn).toBeVisible();
    await removeBtn.click();

    // Assert: grid goes back to empty state
    await expect(page.getByTestId("empty-state")).toBeVisible();
  });

  test("add multiple streams (Kick + Twitch) -> both appear in grid -> remove all", async ({
    page,
  }) => {
    test.setTimeout(60000);

    // Arrange: verify EmptyState is visible
    await expect(page.getByTestId("empty-state")).toBeVisible();

    // Act: add first stream (Kick xqc)
    await page.getByTestId("add-stream-btn").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByTestId("platform-kick").click();
    await page.getByTestId("channel-input").fill("xqc");
    await page.getByTestId("add-submit-btn").click();
    await expect(page.getByTestId("stream-item-xqc")).toBeVisible();

    // Act: add second stream (Twitch shroud)
    await page.getByTestId("add-stream-btn").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByTestId("platform-twitch").click();
    await page.getByTestId("channel-input").fill("shroud");
    await page.getByTestId("add-submit-btn").click();
    await expect(page.getByTestId("stream-item-shroud")).toBeVisible();

    // Assert: both streams exist in grid
    await expect(page.getByTestId("stream-item-xqc")).toBeVisible();
    await expect(page.getByTestId("stream-item-shroud")).toBeVisible();

    // Wait for skeleton loaders (3s) to finish
    await page.waitForTimeout(3500);

    // Act: remove first stream
    const xqcItem = page.getByTestId("stream-item-xqc");
    await xqcItem.hover();
    const removeXqcBtn = page.getByTestId("remove-stream-xqc");
    await expect(removeXqcBtn).toBeVisible();
    await removeXqcBtn.click();
    await expect(page.getByTestId("stream-item-xqc")).not.toBeVisible();
    await expect(page.getByTestId("stream-item-shroud")).toBeVisible();

    // Act: remove second stream
    const shroudItem = page.getByTestId("stream-item-shroud");
    await shroudItem.hover();
    const removeShroudBtn = page.getByTestId("remove-stream-shroud");
    await expect(removeShroudBtn).toBeVisible();
    await removeShroudBtn.click();

    // Assert: grid returns to empty state
    await expect(page.getByTestId("empty-state")).toBeVisible();
  });
});
