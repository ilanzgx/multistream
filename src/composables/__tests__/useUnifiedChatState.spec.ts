import { effectScope, ref, type EffectScope } from "vue";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies
const mockStreams = ref<any[]>([]);
vi.mock("@/composables/useStreams", () => ({
  useStreams: () => ({
    streams: mockStreams,
  }),
}));

const mockAuthenticated = ref(false);
vi.mock("@/composables/useTwitchAuth", () => ({
  useTwitchAuth: () => ({
    authenticated: mockAuthenticated,
  }),
}));

import { useUnifiedChatState } from "../useUnifiedChatState";

describe("useUnifiedChatState", () => {
  let scope: EffectScope;

  beforeEach(() => {
    scope = effectScope();
    mockStreams.value = [];
    mockAuthenticated.value = false;
  });

  afterEach(() => {
    scope.stop();
  });

  it("does not show unified chat when there are less than 2 total streams", () => {
    // Arrange
    mockStreams.value = [{ platform: "twitch", channel: "test1" }];
    mockAuthenticated.value = true;

    // Act
    let state: ReturnType<typeof useUnifiedChatState>;
    scope.run(() => {
      state = useUnifiedChatState();
    });

    // Assert
    expect(state!.unifiedChatState.value.showUnifiedChat).toBe(false);
  });

  it("shows unified chat when there are 2 or more total streams", () => {
    // Arrange
    mockStreams.value = [
      { platform: "twitch", channel: "test1" },
      { platform: "kick", channel: "test2" },
    ];
    mockAuthenticated.value = true;

    // Act
    let state: ReturnType<typeof useUnifiedChatState>;
    scope.run(() => {
      state = useUnifiedChatState();
    });

    // Assert
    expect(state!.unifiedChatState.value.showUnifiedChat).toBe(true);
  });

  it("calculates active platforms and total readable correctly when authenticated", () => {
    // Arrange
    mockStreams.value = [
      { platform: "twitch", channel: "test1" },
      { platform: "twitch", channel: "test2" },
      { platform: "kick", channel: "test3" },
    ];
    mockAuthenticated.value = true;

    // Act
    let state: ReturnType<typeof useUnifiedChatState>;
    scope.run(() => {
      state = useUnifiedChatState();
    });

    // Assert
    expect(state!.unifiedChatState.value.activePlatforms).toEqual(["twitch", "kick"]);
    expect(state!.unifiedChatState.value.totalReadable).toBe(3);
    expect(state!.unifiedChatState.value.warningType).toBe("none");
  });

  it("does not count twitch as readable when unauthenticated", () => {
    // Arrange
    mockStreams.value = [
      { platform: "twitch", channel: "test1" },
      { platform: "twitch", channel: "test2" },
      { platform: "kick", channel: "test3" },
    ];
    mockAuthenticated.value = false;

    // Act
    let state: ReturnType<typeof useUnifiedChatState>;
    scope.run(() => {
      state = useUnifiedChatState();
    });

    // Assert
    expect(state!.unifiedChatState.value.activePlatforms).toEqual(["kick"]);
    expect(state!.unifiedChatState.value.totalReadable).toBe(1);
  });

  it("shows full warning when only twitch streams exist and user is not authenticated", () => {
    // Arrange
    mockStreams.value = [
      { platform: "twitch", channel: "test1" },
      { platform: "twitch", channel: "test2" },
    ];
    mockAuthenticated.value = false;

    // Act
    let state: ReturnType<typeof useUnifiedChatState>;
    scope.run(() => {
      state = useUnifiedChatState();
    });

    // Assert
    expect(state!.unifiedChatState.value.warningType).toBe("full");
    expect(state!.unifiedChatState.value.warningMessage).toBe("chat.unified.warningTwitchLogin");
  });

  it("shows banner warning when twitch and kick streams exist and user is not authenticated", () => {
    // Arrange
    mockStreams.value = [
      { platform: "twitch", channel: "test1" },
      { platform: "kick", channel: "test2" },
    ];
    mockAuthenticated.value = false;

    // Act
    let state: ReturnType<typeof useUnifiedChatState>;
    scope.run(() => {
      state = useUnifiedChatState();
    });

    // Assert
    expect(state!.unifiedChatState.value.warningType).toBe("banner");
    expect(state!.unifiedChatState.value.warningMessage).toBe(
      "chat.unified.warningTwitchLoginToMerge"
    );
  });

  it("shows no warning when only kick streams exist regardless of auth", () => {
    // Arrange
    mockStreams.value = [
      { platform: "kick", channel: "test1" },
      { platform: "kick", channel: "test2" },
    ];
    mockAuthenticated.value = false; // Twitch not authenticated

    // Act
    let state: ReturnType<typeof useUnifiedChatState>;
    scope.run(() => {
      state = useUnifiedChatState();
    });

    // Assert
    expect(state!.unifiedChatState.value.warningType).toBe("none");
    expect(state!.unifiedChatState.value.warningMessage).toBe("");
  });
});
