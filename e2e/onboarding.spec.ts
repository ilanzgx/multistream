import { test, expect } from "@playwright/test";

test.describe("Onboarding Tour E2E Test", () => {
  test.beforeEach(async ({ page }) => {
    // Arrange: clean persistent state and do NOT mark onboarding as completed
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("locale", "en");
      // preferences.onboardingCompleted is omitted/false
    });
    await page.reload();
  });

  test("onboarding tour appears automatically when onboardingCompleted is false", async ({
    page,
  }) => {
    // Assert: onboarding dialog is visible automatically
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Act: click skip or next button to finish tour
    const skipBtn = page.getByRole("button", { name: /Skip/i });
    await expect(skipBtn).toBeVisible();
    await skipBtn.click();

    // Assert: onboarding dialog closes
    await expect(dialog).not.toBeVisible();
  });
});
