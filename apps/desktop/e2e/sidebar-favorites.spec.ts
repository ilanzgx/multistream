import { test, expect } from "@playwright/test";

test.describe("Favorites & Recents E2E Test", () => {
  test.beforeEach(async ({ page }) => {
    // Arrange: set up localStorage with pre-populated favorites
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("locale", "en");
      localStorage.setItem("preferences.onboardingCompleted", "true");
      localStorage.setItem("preferences.sidebarOpen", "true");
      localStorage.setItem(
        "favorites",
        JSON.stringify([{ channel: "shroud", platform: "twitch", addedAt: Date.now() }])
      );
    });
    await page.reload();
  });

  test("favorites appear in AddDialog and can be quick-added to grid", async ({ page }) => {
    // Act: open AddDialog
    await page.getByTestId("add-stream-btn").click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Assert: favorites section is visible with "shroud"
    await expect(page.getByText("Favorites")).toBeVisible();
    const favoriteChip = page.getByText("shroud");
    await expect(favoriteChip).toBeVisible();

    // Act: click favorite chip to quick-add
    await favoriteChip.click();

    // Assert: dialog closes and stream appears in grid
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByTestId("stream-item-shroud")).toBeVisible();
  });
});
