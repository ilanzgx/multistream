import { test, expect } from "@playwright/test";

test.describe("Live Transcription UI E2E Test", () => {
  test.beforeEach(async ({ page }) => {
    // Arrange: Mock Tauri IPC and configure state
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("locale", "en");
      localStorage.setItem("preferences.onboardingCompleted", "true");

      // Mock Tauri globals so the app thinks it is running in Tauri
      (window as any).__TAURI_INTERNALS__ = {
        invoke: (cmd: string) => {
          if (cmd === "get_transcription_status") {
            return Promise.resolve({ installed_models: ["base"], active: false });
          }
          return Promise.resolve();
        },
        listen: () => Promise.resolve(() => {}),
      };
    });

    await page.goto("/");
  });

  test("settings dialog should show transcription section when running in Tauri", async ({
    page,
  }) => {
    // Act: Click settings button
    await page.getByTestId("settings-btn").click();

    // Assert: Settings dialog is open
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Act: Switch to the Features tab where Transcription lives
    await page.getByRole("tab", { name: "Features" }).click();

    // Assert: Transcription section is visible
    await expect(page.getByRole("heading", { name: "Live Transcription" })).toBeVisible();
    await expect(
      page.getByText("Real-time captions generated using local machine learning.")
    ).toBeVisible();

    // Assert: Since model 'base' is mocked as installed, the mode select and toggle should appear
    await expect(page.getByTestId("transcription-mode-select")).toBeVisible();
    await expect(page.getByTestId("transcription-enable-toggle")).toBeVisible();
  });
});
