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
    await expect(page.getByTestId("stream-item-xqc")).toBeVisible();

    // Act: hover to reveal controls and click X (remove)
    await page.getByTestId("stream-item-xqc").hover();
    await page.getByTestId("remove-stream-xqc").click();

    // Assert: grid goes back to empty state
    await expect(page.getByTestId("empty-state")).toBeVisible();
  });
});
