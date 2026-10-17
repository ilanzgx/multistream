import { effectScope, type EffectScope } from "vue";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mockIsFullscreen = vi.fn();
const mockSetFullscreen = vi.fn();

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isFullscreen: mockIsFullscreen,
    setFullscreen: mockSetFullscreen,
  }),
}));

vi.mock("@/composables/useUpdater", () => ({
  isTauri: vi.fn(() => true),
}));

import { useImmersiveMode } from "../useImmersiveMode";
import { usePreferences } from "../usePreferences";

describe("useImmersiveMode composable unit tests", () => {
  let scope: EffectScope;
  let sut: ReturnType<typeof useImmersiveMode>;
  let prefs: ReturnType<typeof usePreferences>;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockIsFullscreen.mockResolvedValue(false);
    mockSetFullscreen.mockResolvedValue(undefined);

    scope = effectScope();
    prefs = scope.run(() => usePreferences())!;
    prefs.resetPreferences();
    sut = scope.run(() => useImmersiveMode())!;
    sut.hideAllPanels();
  });

  afterEach(() => {
    scope.stop();
    vi.useRealTimers();
  });

  it("should initialize with default states", () => {
    // Arrange & Act
    const { immersiveModeEnabled, isFullscreen, isLeftPanelRevealed, isRightPanelRevealed } = sut;

    // Assert
    expect(immersiveModeEnabled.value).toBe(false);
    expect(isFullscreen.value).toBe(false);
    expect(isLeftPanelRevealed.value).toBe(false);
    expect(isRightPanelRevealed.value).toBe(false);
  });

  it("should toggle immersive mode correctly", () => {
    // Arrange
    const { toggleImmersiveMode, immersiveModeEnabled } = sut;
    expect(immersiveModeEnabled.value).toBe(false);

    // Act
    toggleImmersiveMode();

    // Assert
    expect(immersiveModeEnabled.value).toBe(true);

    // Act
    toggleImmersiveMode();

    // Assert
    expect(immersiveModeEnabled.value).toBe(false);
  });

  it("should reveal left panel and auto-hide after scheduled delay", () => {
    // Arrange
    const { revealLeftPanel, scheduleHideLeftPanel, isLeftPanelRevealed } = sut;

    // Act - Reveal
    revealLeftPanel();

    // Assert
    expect(isLeftPanelRevealed.value).toBe(true);

    // Act - Schedule hide
    scheduleHideLeftPanel(400);

    // Advance 300ms (should still be revealed)
    vi.advanceTimersByTime(300);
    expect(isLeftPanelRevealed.value).toBe(true);

    // Advance remaining 100ms
    vi.advanceTimersByTime(100);

    // Assert
    expect(isLeftPanelRevealed.value).toBe(false);
  });

  it("should cancel scheduled hide if re-revealed before timer fires", () => {
    // Arrange
    const { revealLeftPanel, scheduleHideLeftPanel, isLeftPanelRevealed } = sut;
    revealLeftPanel();
    scheduleHideLeftPanel(400);

    // Advance 250ms
    vi.advanceTimersByTime(250);
    expect(isLeftPanelRevealed.value).toBe(true);

    // Act - Cursor re-enters panel
    revealLeftPanel();
    vi.advanceTimersByTime(300);

    // Assert - Panel remains open because timer was cancelled
    expect(isLeftPanelRevealed.value).toBe(true);
  });

  it("should reveal right panel and auto-hide after scheduled delay", () => {
    // Arrange
    const { revealRightPanel, scheduleHideRightPanel, isRightPanelRevealed } = sut;

    // Act - Reveal
    revealRightPanel();

    // Assert
    expect(isRightPanelRevealed.value).toBe(true);

    // Act - Schedule hide
    scheduleHideRightPanel(400);
    vi.advanceTimersByTime(400);

    // Assert
    expect(isRightPanelRevealed.value).toBe(false);
  });

  it("should immediately hide all panels when hideAllPanels is called", () => {
    // Arrange
    const {
      revealLeftPanel,
      revealRightPanel,
      hideAllPanels,
      isLeftPanelRevealed,
      isRightPanelRevealed,
    } = sut;
    revealLeftPanel();
    revealRightPanel();
    expect(isLeftPanelRevealed.value).toBe(true);
    expect(isRightPanelRevealed.value).toBe(true);

    // Act
    hideAllPanels();

    // Assert
    expect(isLeftPanelRevealed.value).toBe(false);
    expect(isRightPanelRevealed.value).toBe(false);
  });

  it("should toggle fullscreen and synchronize immersive mode state", async () => {
    // Arrange
    const { toggleFullscreen, isFullscreen, immersiveModeEnabled } = sut;
    mockSetFullscreen.mockResolvedValue(undefined);

    // Act - Enter fullscreen
    await toggleFullscreen();

    // Assert
    expect(mockSetFullscreen).toHaveBeenCalledWith(true);
    expect(isFullscreen.value).toBe(true);
    expect(immersiveModeEnabled.value).toBe(true);

    // Act - Exit fullscreen
    await toggleFullscreen();

    // Assert
    expect(mockSetFullscreen).toHaveBeenCalledWith(false);
    expect(isFullscreen.value).toBe(false);
    expect(immersiveModeEnabled.value).toBe(false);
  });

  it("should handle escape key by exiting fullscreen first if fullscreen is active", async () => {
    // Arrange
    const { toggleFullscreen, handleEscape, isFullscreen, immersiveModeEnabled } = sut;
    await toggleFullscreen();
    expect(isFullscreen.value).toBe(true);
    expect(immersiveModeEnabled.value).toBe(true);

    // Act
    await handleEscape();

    // Assert
    expect(isFullscreen.value).toBe(false);
    expect(immersiveModeEnabled.value).toBe(false);
  });

  it("should handle escape key by disabling immersive mode if not in fullscreen", async () => {
    // Arrange
    const { toggleImmersiveMode, handleEscape, isFullscreen, immersiveModeEnabled } = sut;
    toggleImmersiveMode();
    expect(isFullscreen.value).toBe(false);
    expect(immersiveModeEnabled.value).toBe(true);

    // Act
    await handleEscape();

    // Assert
    expect(immersiveModeEnabled.value).toBe(false);
  });

  it("should handle escape key by hiding revealed panels first without disabling immersive mode", async () => {
    // Arrange
    const {
      toggleImmersiveMode,
      revealLeftPanel,
      handleEscape,
      isLeftPanelRevealed,
      immersiveModeEnabled,
    } = sut;
    toggleImmersiveMode();
    revealLeftPanel();
    expect(isLeftPanelRevealed.value).toBe(true);
    expect(immersiveModeEnabled.value).toBe(true);

    // Act
    await handleEscape();

    // Assert
    expect(isLeftPanelRevealed.value).toBe(false);
    expect(immersiveModeEnabled.value).toBe(true);
  });

  it("should sync fullscreen state from window query", async () => {
    // Arrange
    const { syncFullscreenState, isFullscreen } = sut;
    mockIsFullscreen.mockResolvedValue(true);

    // Act
    await syncFullscreenState();

    // Assert
    expect(isFullscreen.value).toBe(true);
  });
});
