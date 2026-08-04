import { effectScope, type EffectScope } from "vue";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

vi.mock("@/composables/useUpdater", () => ({
  isTauri: () => true,
}));

vi.mock("@/composables/useStreams", () => ({
  useStreams: () => ({
    streams: { value: [] },
  }),
}));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTwitchAuth } from "../useTwitchAuth";

describe("useTwitchAuth", () => {
  let scope: EffectScope;

  beforeEach(() => {
    scope = effectScope();
    vi.clearAllMocks();
    (listen as ReturnType<typeof vi.fn>).mockResolvedValue(vi.fn());
  });

  afterEach(() => {
    scope.stop();
  });

  it("initialises as unauthenticated when backend returns false", async () => {
    // Arrange
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      authenticated: false,
      username: null,
    });

    // Act
    let auth: ReturnType<typeof useTwitchAuth>;
    await scope.run(async () => {
      auth = useTwitchAuth();
      await Promise.resolve();
    });

    // Assert
    expect(auth!.authenticated.value).toBe(false);
    expect(auth!.username.value).toBeNull();
  });

  it("sets authenticated and username from backend response", async () => {
    // Arrange
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      authenticated: true,
      username: "streamuser",
    });

    // Act
    let auth: ReturnType<typeof useTwitchAuth>;
    await scope.run(async () => {
      auth = useTwitchAuth();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert
    expect(auth!.authenticated.value).toBe(true);
    expect(auth!.username.value).toBe("streamuser");
  });

  it("calls twitch_login on login()", async () => {
    // Arrange
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      authenticated: false,
      username: null,
    });

    let auth: ReturnType<typeof useTwitchAuth>;
    scope.run(() => {
      auth = useTwitchAuth();
    });

    // Act
    await auth!.startLogin();

    // Assert
    expect(invoke).toHaveBeenCalledWith("twitch_login");
  });

  it("calls twitch_logout on logout()", async () => {
    // Arrange
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      authenticated: false,
      username: null,
    });

    let auth: ReturnType<typeof useTwitchAuth>;
    scope.run(() => {
      auth = useTwitchAuth();
    });

    // Act
    await auth!.logout();

    // Assert
    expect(invoke).toHaveBeenCalledWith("twitch_logout");
  });
});
