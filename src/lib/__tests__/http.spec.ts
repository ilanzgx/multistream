import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isTauri, httpGet, httpPost } from "../http";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: vi.fn(),
}));

describe("http library unit tests", () => {
  let globalFetchSpy: ReturnType<typeof vi.spyOn>;
  let originalWindow: typeof window;

  beforeEach(() => {
    // Arrange (global environment)
    globalFetchSpy = vi.spyOn(globalThis, "fetch");
    originalWindow = globalThis.window;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    if (globalThis.window) {
      // @ts-expect-error Ignore window being undefined
      delete globalThis.window.__TAURI_INTERNALS__;
    }
  });

  describe("isTauri", () => {
    it("should return true when running in Tauri context", () => {
      // Arrange
      // @ts-expect-error Ignore window being undefined
      globalThis.window = { __TAURI_INTERNALS__: {} };

      // Act
      const result = isTauri();

      // Assert
      expect(result).toBe(true);
    });

    it("should return false when window is undefined", () => {
      // Arrange
      const originalWindowDesc = Object.getOwnPropertyDescriptor(globalThis, "window");
      // @ts-expect-error Ignore window being undefined
      delete globalThis.window;

      try {
        // Act
        const result = isTauri();

        // Assert
        expect(result).toBe(false);
      } finally {
        if (originalWindowDesc) {
          Object.defineProperty(globalThis, "window", originalWindowDesc);
        }
      }
    });

    it("should return false when __TAURI_INTERNALS__ is not in window", () => {
      // Arrange
      // @ts-expect-error Ignore window being undefined
      globalThis.window = {};

      // Act
      const result = isTauri();

      // Assert
      expect(result).toBe(false);
    });
  });

  describe("httpGet", () => {
    it("should call tauriFetch when isTauri is true", async () => {
      // Arrange
      // @ts-expect-error Ignore window being undefined
      globalThis.window = { __TAURI_INTERNALS__: {} };
      const url = "https://api.example.com/data";
      const headers = { Authorization: "Bearer token" };
      const mockResponse = new Response("tauri-data");
      vi.mocked(tauriFetch).mockResolvedValue(mockResponse);

      // Act
      const result = await httpGet(url, headers);

      // Assert
      expect(tauriFetch).toHaveBeenCalledWith(url, { method: "GET", headers });
      expect(globalFetchSpy).not.toHaveBeenCalled();
      expect(result).toBe(mockResponse);
    });

    it("should call global fetch when isTauri is false", async () => {
      // Arrange
      // @ts-expect-error Ignore window being undefined
      globalThis.window = {};
      const url = "https://api.example.com/data";
      const headers = { Authorization: "Bearer token" };
      const mockResponse = new Response("web-data");
      globalFetchSpy.mockResolvedValue(mockResponse);

      // Act
      const result = await httpGet(url, headers);

      // Assert
      expect(globalFetchSpy).toHaveBeenCalledWith(url, { headers });
      expect(tauriFetch).not.toHaveBeenCalled();
      expect(result).toBe(mockResponse);
    });
  });

  describe("httpPost", () => {
    it("should call tauriFetch with POST method and body when isTauri is true", async () => {
      // Arrange
      // @ts-expect-error Ignore window being undefined
      globalThis.window = { __TAURI_INTERNALS__: {} };
      const url = "https://api.example.com/data";
      const body = JSON.stringify({ key: "value" });
      const headers = { "Content-Type": "application/json" };
      const mockResponse = new Response("tauri-post-data");
      vi.mocked(tauriFetch).mockResolvedValue(mockResponse);

      // Act
      const result = await httpPost(url, body, headers);

      // Assert
      expect(tauriFetch).toHaveBeenCalledWith(url, { method: "POST", body, headers });
      expect(globalFetchSpy).not.toHaveBeenCalled();
      expect(result).toBe(mockResponse);
    });

    it("should call global fetch with POST method and body when isTauri is false", async () => {
      // Arrange
      // @ts-expect-error Ignore window being undefined
      globalThis.window = {};
      const url = "https://api.example.com/data";
      const body = JSON.stringify({ key: "value" });
      const headers = { "Content-Type": "application/json" };
      const mockResponse = new Response("web-post-data");
      globalFetchSpy.mockResolvedValue(mockResponse);

      // Act
      const result = await httpPost(url, body, headers);

      // Assert
      expect(globalFetchSpy).toHaveBeenCalledWith(url, { method: "POST", body, headers });
      expect(tauriFetch).not.toHaveBeenCalled();
      expect(result).toBe(mockResponse);
    });
  });
});
