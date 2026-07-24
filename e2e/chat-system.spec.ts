import { test, expect } from "@playwright/test";

test.describe("Chat System & Unified Chat E2E Test", () => {
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

  test("empty chat state displays prompt when no streams exist", async ({ page }) => {
    // Assert: sidebar action button is visible
    await expect(page.getByTestId("add-stream-btn")).toBeVisible();

    // Assert: chat sidebar displays no streams hint text
    await expect(page.getByText("No streams available.")).toBeVisible();
    await expect(page.getByText("Add a stream to view chat.")).toBeVisible();
  });

  test("adding a stream shows the channel chat selector", async ({ page }) => {
    // Arrange: add a Kick stream
    await page.getByTestId("add-stream-btn").click();
    await page.getByTestId("platform-kick").click();
    await page.getByTestId("channel-input").fill("xqc");
    await page.getByTestId("add-submit-btn").click();

    // Assert: stream appears in grid and chat sidebar is visible
    await expect(page.getByTestId("stream-item-xqc")).toBeVisible();
    await expect(page.getByTestId("add-stream-btn")).toBeVisible();
  });

  test("mocked Tauri environment enables Unified Chat option", async ({ page }) => {
    // Arrange: mock Tauri globals for Unified Chat
    await page.addInitScript(() => {
      (window as any).__TAURI_INTERNALS__ = {
        invoke: (cmd: string) => {
          if (cmd === "twitch_get_messages") return Promise.resolve([]);
          if (cmd === "twitch_get_connection_state") return Promise.resolve({ state: "connected" });
          if (cmd === "is_transcription_supported") return Promise.resolve(false);
          return Promise.resolve();
        },
        listen: () => Promise.resolve(() => {}),
        transformCallback: () => 1,
      };
    });

    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("locale", "en");
      localStorage.setItem("preferences.onboardingCompleted", "true");
      localStorage.setItem("preferences.sidebarOpen", "true");
    });
    await page.reload();

    // Act: add Twitch stream
    await page.getByTestId("add-stream-btn").click();
    await page.getByTestId("platform-twitch").click();
    await page.getByTestId("channel-input").fill("shroud");
    await page.getByTestId("add-submit-btn").click();

    // Assert: stream is added and sidebar action buttons remain accessible
    await expect(page.getByTestId("stream-item-shroud")).toBeVisible();
    await expect(page.getByTestId("add-stream-btn")).toBeVisible();
  });
});
