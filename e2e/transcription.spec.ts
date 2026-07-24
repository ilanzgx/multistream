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
          if (cmd === "is_transcription_supported") {
            return Promise.resolve(true);
          }
          return Promise.resolve();
        },
        listen: () => Promise.resolve(() => {}),
        transformCallback: () => 1,
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

    // Act: Switch to the Transcription (Resources) tab
    await page.getByRole("tab", { name: "Transcription" }).click();

    // Assert: Live Transcription heading is visible
    await expect(page.getByRole("heading", { name: "Live Transcription" })).toBeVisible();

    // Assert: Mode select and toggle are visible when model 'base' is installed
    await expect(page.getByTestId("transcription-mode-select")).toBeVisible();
    await expect(page.getByTestId("transcription-enable-toggle")).toBeVisible();
  });

  test("can change transcription caption mode (Original vs Translate)", async ({ page }) => {
    // Act: Open settings and go to Transcription tab
    await page.getByTestId("settings-btn").click();
    await page.getByRole("tab", { name: "Transcription" }).click();

    // Act: Change select value to translate
    const select = page.getByTestId("transcription-mode-select");
    await select.selectOption("translate");

    // Assert: Value changes to translate
    await expect(select).toHaveValue("translate");
  });
});
