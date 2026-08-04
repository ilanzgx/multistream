import { test, expect } from "@playwright/test";

test.describe("Settings & i18n Preferences E2E Test", () => {
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

  test("settings dialog opens and allows switching language to Portuguese", async ({ page }) => {
    // Act: open settings dialog
    await page.getByTestId("settings-btn").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Assert: English title is present
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    // Act: click Portuguese language option (button with label "PT")
    const ptButton = dialog.getByRole("button", { name: "PT", exact: true });
    await expect(ptButton).toBeVisible();
    await ptButton.click();

    // Assert: UI title dynamically updates to Portuguese "Configurações"
    await expect(page.getByRole("heading", { name: "Configurações" })).toBeVisible();

    // Assert: localStorage now retains 'pt'
    const storedLocale = await page.evaluate(() => localStorage.getItem("locale"));
    expect(storedLocale).toMatch(/^pt/);
  });
});
