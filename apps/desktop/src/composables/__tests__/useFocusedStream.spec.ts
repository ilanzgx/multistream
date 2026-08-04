import { describe, it, expect, beforeEach, vi } from "vitest";
import { useFocusedStream } from "../useFocusedStream";

describe("useFocusedStream composable unit tests", () => {
  let sut: ReturnType<typeof useFocusedStream>;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();

    sut = useFocusedStream();
    sut.clearFocus();
  });

  it("should initialize with no stream focused", () => {
    // Assert
    expect(sut.focusedStreamId.value).toBe(null);
  });

  it("should focus a stream when toggleFocus is called", () => {
    // Arrange
    const streamId = "test-stream-id";

    // Act
    sut.toggleFocus(streamId);

    // Assert
    expect(sut.focusedStreamId.value).toBe(streamId);
  });

  it("should unfocus a stream when toggleFocus is called with the same ID", () => {
    // Assert
    const streamId = "test-stream-id";

    // Act & Assert
    sut.toggleFocus(streamId);
    expect(sut.focusedStreamId.value).toBe(streamId);

    // Act & Assert
    sut.toggleFocus(streamId);
    expect(sut.focusedStreamId.value).toBe(null);
  });

  it("should change focused stream when toggleFocus is called with different ID", () => {
    // Assert
    const firstId = "first-id";
    const secondId = "second-id";

    // Act & Assert
    sut.toggleFocus(firstId);
    expect(sut.focusedStreamId.value).toBe(firstId);

    // Act & Assert
    sut.toggleFocus(secondId);
    expect(sut.focusedStreamId.value).toBe(secondId);
  });

  it("should return correct focus status with isFocused", () => {
    // Arrange & Assert
    const streamId = "test-stream-id";
    expect(sut.isFocused(streamId)).toBe(false);

    // Act & Assert
    sut.toggleFocus(streamId);
    expect(sut.isFocused(streamId)).toBe(true);
    expect(sut.isFocused("other-id")).toBe(false);
  });

  it("should clear focus when clearFocus is called", () => {
    // Act & Assert
    sut.toggleFocus("test-id");
    expect(sut.focusedStreamId.value).toBe("test-id");

    // Act & Assert
    sut.clearFocus();
    expect(sut.focusedStreamId.value).toBe(null);
  });
});
