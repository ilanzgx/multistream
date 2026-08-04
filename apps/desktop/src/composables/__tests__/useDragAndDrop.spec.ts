import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { ref } from "vue";
import { useDragAndDrop } from "../useDragAndDrop";
import type { Stream } from "../useStreams";

const mockStreamsRef = ref<Stream[]>([]);
const mockFocusedStreamIdRef = ref<string | null>(null);

vi.mock("../useStreams", () => ({
  useStreams: () => ({
    streams: mockStreamsRef,
  }),
}));

vi.mock("../useFocusedStream", () => ({
  useFocusedStream: () => ({
    focusedStreamId: mockFocusedStreamIdRef,
  }),
}));

const mockStreams: Stream[] = [
  { id: "stream-1", channel: "gaules", platform: "twitch" },
  { id: "stream-2", channel: "coringa", platform: "twitch" },
  { id: "stream-3", channel: "alanzoka", platform: "twitch" },
];

describe("useDragAndDrop unit tests", () => {
  let sut: ReturnType<typeof useDragAndDrop>;

  beforeEach(() => {
    sut = useDragAndDrop();

    // Arrange: Reset mocked state
    mockStreamsRef.value = [...mockStreams];
    mockFocusedStreamIdRef.value = null;
    sut.onGlobalMouseUp();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Mouse Events - Drag Start", () => {
    it("should set draggingId on mousedown", () => {
      // Act
      sut.onMouseDown("stream-1");

      // Assert
      expect(sut.draggingId.value).toBe("stream-1");
      expect(sut.isDragging.value).toBe(true);
    });
  });

  describe("Mouse Events - Hover", () => {
    it("should set overId on mouseenter if dragging", () => {
      // Arrange
      sut.onMouseDown("stream-1");

      // Act
      sut.onMouseEnter("stream-2");

      // Assert
      expect(sut.overId.value).toBe("stream-2");
    });

    it("should not set overId on mouseenter if not dragging", () => {
      // Act
      sut.onMouseEnter("stream-2");

      // Assert
      expect(sut.overId.value).toBeNull();
    });

    it("should clear overId on mouseleave", () => {
      // Arrange
      sut.onMouseDown("stream-1");
      sut.onMouseEnter("stream-2");

      // Act
      sut.onMouseLeave();

      // Assert
      expect(sut.overId.value).toBeNull();
    });
  });

  describe("Mouse Events - Drop (mouseup)", () => {
    it("should do nothing if mouseup when not dragging", () => {
      // Act
      sut.onMouseUp("stream-2");

      // Assert
      expect(mockStreamsRef.value).toEqual(mockStreams);
    });

    it("should do nothing if mouseup on self", () => {
      // Arrange
      sut.onMouseDown("stream-1");
      sut.onMouseEnter("stream-1");

      // Act
      sut.onMouseUp("stream-1");

      // Assert
      expect(mockStreamsRef.value).toEqual(mockStreams);
      expect(sut.draggingId.value).toBeNull();
    });

    it("should do nothing if overId is null when mouseup fires", () => {
      // Arrange
      sut.onMouseDown("stream-1");

      // Act - mouseup without entering another stream
      sut.onMouseUp("stream-1");

      // Assert
      expect(mockStreamsRef.value).toEqual(mockStreams);
    });

    it("should swap two streams when mouseup on a valid target", () => {
      // Arrange
      sut.onMouseDown("stream-1");
      sut.onMouseEnter("stream-3");

      // Act
      sut.onMouseUp("stream-3");

      // Assert
      const streams = mockStreamsRef.value;
      expect(streams[0]!.id).toBe("stream-3");
      expect(streams[1]!.id).toBe("stream-2");
      expect(streams[2]!.id).toBe("stream-1");
      expect(sut.draggingId.value).toBeNull();
    });

    it("should swap focusedStreamId if the dragged stream was focused", () => {
      // Arrange
      mockFocusedStreamIdRef.value = "stream-1";
      sut.onMouseDown("stream-1");
      sut.onMouseEnter("stream-2");

      // Act
      sut.onMouseUp("stream-2");

      // Assert
      expect(mockFocusedStreamIdRef.value).toBe("stream-2");
      expect(mockStreamsRef.value[0]!.id).toBe("stream-2");
      expect(mockStreamsRef.value[1]!.id).toBe("stream-1");
    });

    it("should swap focusedStreamId if the target stream was focused", () => {
      // Arrange
      mockFocusedStreamIdRef.value = "stream-2";
      sut.onMouseDown("stream-1");
      sut.onMouseEnter("stream-2");

      // Act
      sut.onMouseUp("stream-2");

      // Assert
      expect(mockFocusedStreamIdRef.value).toBe("stream-1");
      expect(mockStreamsRef.value[0]!.id).toBe("stream-2");
      expect(mockStreamsRef.value[1]!.id).toBe("stream-1");
    });

    it("should not touch focusedStreamId if neither dragged nor target were focused", () => {
      // Arrange
      mockFocusedStreamIdRef.value = "stream-3";
      sut.onMouseDown("stream-1");
      sut.onMouseEnter("stream-2");

      // Act
      sut.onMouseUp("stream-2");

      // Assert
      expect(mockFocusedStreamIdRef.value).toBe("stream-3");
    });
  });

  describe("Global mouseup cleanup", () => {
    it("should clear dragging state on global mouseup", () => {
      // Arrange
      sut.onMouseDown("stream-1");
      sut.onMouseEnter("stream-2");

      // Act
      sut.onGlobalMouseUp();

      // Assert
      expect(sut.draggingId.value).toBeNull();
      expect(sut.overId.value).toBeNull();
      expect(sut.isDragging.value).toBe(false);
    });
  });
});
