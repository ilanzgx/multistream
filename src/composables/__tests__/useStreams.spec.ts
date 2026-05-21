import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
    const { addStream, clearStreams, streams, requestRemoveStream, isLeaving } = sut;

    addStream("s1", "twitch");
    addStream("s2", "kick");

    // Assert (check if streams were added)
    expect(streams.value.length).toBe(2);

    const s1Id = streams.value[0]!.id;
    requestRemoveStream(s1Id);
    expect(isLeaving(s1Id)).toBe(true);

    // Act
    clearStreams();

    // Assert (check if streams were cleared and leaving is cleared)
    expect(streams.value.length).toBe(0);
    expect(isLeaving(s1Id)).toBe(false);
  });

  describe("two-phase removal (requestRemoveStream)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should mark a stream as leaving and then remove it after delay", () => {
      const { addStream, requestRemoveStream, isLeaving, streams } = sut;

      addStream("testStream", "twitch");
      const id = streams.value[0]!.id;

      expect(isLeaving(id)).toBe(false);

      // Act: request removal
      requestRemoveStream(id);

      // Assert phase 1: marked as leaving, but still in streams
      expect(isLeaving(id)).toBe(true);
      expect(streams.value.length).toBe(1);

      // Act: advance time by 250ms
      vi.advanceTimersByTime(250);

      // Assert phase 2: stream is fully removed
      expect(isLeaving(id)).toBe(false);
      expect(streams.value.length).toBe(0);
    });

    it("should ignore duplicate requestRemoveStream calls for same stream ID", () => {
      const { addStream, requestRemoveStream, isLeaving, streams } = sut;

      addStream("testStream", "twitch");
      const id = streams.value[0]!.id;

      requestRemoveStream(id);
      expect(isLeaving(id)).toBe(true);

      // Call again - should do nothing
      requestRemoveStream(id);
      expect(isLeaving(id)).toBe(true);
    });
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

  describe("Kick Stream Reload Counters Workaround", () => {
    it("should generate standard keys for non-Kick streams and dynamic keys for Kick streams", () => {
      const { addStream, getStreamKey, streams } = sut;

      addStream("gaules", "twitch");
      addStream("kick1", "kick");

      const twitchStream = streams.value.find((s) => s.platform === "twitch")!;
      const kickStream = streams.value.find((s) => s.platform === "kick")!;

      expect(getStreamKey(twitchStream)).toBe(twitchStream.id);
      expect(getStreamKey(kickStream)).toBe(`${kickStream.id}-kick-0`);
    });

    it("should increment reload counter of remaining Kick streams when a Kick stream is removed", () => {
      const { addStream, removeStream, getStreamKey, streams } = sut;

      addStream("kick1", "kick");
      addStream("kick2", "kick");
      addStream("gaules", "twitch");

      const k1 = streams.value.find((s) => s.channel === "kick1")!;
      const k2 = streams.value.find((s) => s.channel === "kick2")!;
      const t1 = streams.value.find((s) => s.channel === "gaules")!;

      expect(getStreamKey(k1)).toBe(`${k1.id}-kick-0`);
      expect(getStreamKey(k2)).toBe(`${k2.id}-kick-0`);
      expect(getStreamKey(t1)).toBe(t1.id);

      // Act: Remove kick1
      removeStream(k1.id);

      // Assert: k2 should now have counter 1, t1 should still have standard id
      const updatedK2 = streams.value.find((s) => s.channel === "kick2")!;
      const updatedT1 = streams.value.find((s) => s.channel === "gaules")!;

      expect(getStreamKey(updatedK2)).toBe(`${k2.id}-kick-1`);
      expect(getStreamKey(updatedT1)).toBe(t1.id);
    });

    it("should not increment reload counters when a non-Kick stream is removed", () => {
      const { addStream, removeStream, getStreamKey, streams } = sut;

      addStream("kick1", "kick");
      addStream("gaules", "twitch");

      const k1 = streams.value.find((s) => s.channel === "kick1")!;
      const t1 = streams.value.find((s) => s.channel === "gaules")!;

      expect(getStreamKey(k1)).toBe(`${k1.id}-kick-0`);

      // Act: Remove gaules (twitch)
      removeStream(t1.id);

      // Assert: k1 should still have counter 0
      const updatedK1 = streams.value.find((s) => s.channel === "kick1")!;
      expect(getStreamKey(updatedK1)).toBe(`${k1.id}-kick-0`);
    });
  });
});

