import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRecentEmotes } from "../useRecentEmotes";

vi.mock("@tauri-apps/plugin-store", () => {
  const storeMap = new Map();
  return {
    load: vi.fn().mockResolvedValue({
      get: vi.fn(async (key) => storeMap.get(key)),
      set: vi.fn(async (key, val) => {
        storeMap.set(key, val);
      }),
      save: vi.fn(async () => {}),
    }),
  };
});

describe("useRecentEmotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds emotes and respects MAX_RECENTS limit of 24", () => {
    // Arrange
    const { recentEmotes, addRecent } = useRecentEmotes();
    recentEmotes.value = []; // Reset state since it's a shared composable

    // Act
    for (let i = 0; i < 26; i++) {
      addRecent({ id: `id-${i}`, name: `name-${i}`, url: "url", provider: "global" });
    }

    // Assert
    expect(recentEmotes.value.length).toBe(24);
    expect(recentEmotes.value[0]?.name).toBe("name-25");
  });

  it("moves existing emote to the top when added again", () => {
    // Arrange
    const { recentEmotes, addRecent } = useRecentEmotes();
    recentEmotes.value = [];

    // Act
    addRecent({ id: "1", name: "Kappa", url: "url1", provider: "global" });
    addRecent({ id: "2", name: "LUL", url: "url2", provider: "global" });
    addRecent({ id: "1", name: "Kappa", url: "url1", provider: "global" }); // Re-add Kappa

    // Assert
    expect(recentEmotes.value.length).toBe(2);
    expect(recentEmotes.value[0]?.name).toBe("Kappa"); // Moved to index 0
  });
});
