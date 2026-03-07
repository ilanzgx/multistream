import { describe, it, expect, beforeEach, vi } from "vitest";
import { useStreams } from "../useStreams";
import { toast } from "vue-sonner";

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("vue-sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("./useRecents", () => ({
  useRecents: () => ({
    addRecent: vi.fn(),
  }),
}));

describe("useStreams composable unit tests", () => {
  let sut: ReturnType<typeof useStreams>;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    sut = useStreams();
    sut.clearStreams();
  });

  it("should add a new stream correctly", () => {
    // Arrange
    const { addStream, streams } = sut;

    // Assert (check if streams is empty)
    expect(streams.value.length).toBe(0);

    // Act
    addStream("gaules", "twitch");

    // Assert (check if stream was added)
    expect(streams.value.length).toBe(1);
    expect(streams?.value[0]?.channel).toBe("gaules");
    expect(streams?.value[0]?.platform).toBe("twitch");
    expect(streams?.value[0]?.id).toBeDefined();
  });

  it("should not add a duplicate stream", () => {
    // Arrange
    const { addStream, streams } = sut;

    // Act (first add)
    addStream("alanzoka", "twitch");

    // Assert (ensure stream was added)
    expect(streams.value.length).toBe(1);

    // Act (second add)
    addStream("alanzoka", "twitch");

    // Assert (ensure stream was not added)
    expect(streams.value.length).toBe(1);
    expect(toast.warning).toHaveBeenCalledWith("toasts.add.alreadyAdded");
  });

  it("should allow different platforms for the same channel", () => {
    // Arrange
    const { addStream, streams } = sut;

    // Act
    addStream("xqc", "twitch");
    addStream("xqc", "youtube");

    // Assert
    expect(streams.value.length).toBe(2);
  });

  it("should remove a stream by ID", () => {
    // Arrange
    const { addStream, removeStream, streams } = sut;

    addStream("stream1", "kick");
    addStream("stream2", "youtube");

    // Assert (check if streams were added)
    expect(streams.value.length).toBe(2);

    // Act
    const stream1Id = streams.value.find((s) => s.channel === "stream1")!.id;
    removeStream(stream1Id);

    // Assert (check if stream1 was removed)
    expect(streams.value.length).toBe(1);
    expect(streams.value.find((s) => s.channel === "stream1")).toBeUndefined();
    expect(streams.value.find((s) => s.channel === "stream2")).toBeDefined();
  });

  it("should clear all streams", () => {
    // Arrange
    const { addStream, clearStreams, streams } = sut;

    addStream("s1", "twitch");
    addStream("s2", "kick");

    // Assert (check if streams were added)
    expect(streams.value.length).toBe(2);

    // Act
    clearStreams();

    // Assert (check if streams were cleared)
    expect(streams.value.length).toBe(0);
  });

  describe("Grid classes", () => {
    it("should return class for 1 stream", () => {
      // Arrange
      const { addStream, gridClass } = sut;

      // Act
      addStream("s1", "twitch");

      // Assert
      expect(gridClass.value).toBe("grid-cols-1 grid-rows-1");
    });

    it("should return class for 2 streams", () => {
      // Arrange
      const { addStream, gridClass } = sut;

      // Act
      addStream("s1", "twitch");
      addStream("s2", "twitch");

      // Assert
      expect(gridClass.value).toBe("grid-cols-1 grid-rows-2");
    });

    it("should return class for 3 streams", () => {
      // Arrange
      const { addStream, gridClass } = sut;

      // Act
      addStream("s1", "twitch");
      addStream("s2", "twitch");
      addStream("s3", "twitch");

      // Assert
      expect(gridClass.value).toBe("grid-cols-2 grid-rows-2");
    });

    it("should return default (4 cols / 3 rows) for more than 9 streams", () => {
      // Arrange
      const { addStream, gridClass } = sut;

      // Act
      for (let i = 0; i < 10; i++) {
        addStream(`s${i}`, "twitch");
      }

      // Assert
      expect(gridClass.value).toBe("grid-cols-4 grid-rows-3");
    });
  });
});
