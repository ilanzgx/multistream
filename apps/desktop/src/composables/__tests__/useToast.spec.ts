import { describe, it, expect, beforeEach, vi } from "vitest";
import { useToast, toast, __test_resetToastState } from "../useToast";
import { h } from "vue";

describe("useToast composable unit tests", () => {
  beforeEach(() => {
    // Arrange: reset state before each test
    __test_resetToastState();
    vi.useFakeTimers();
  });

  it("should initialize with empty state (Zero State)", () => {
    // Arrange & Act
    const { toasts } = useToast();

    // Assert
    expect(toasts.value.length).toBe(0);
  });

  it("should add a string toast and remove it via dismiss (Dynamic Transition)", () => {
    // Arrange
    const { toasts, dismiss } = useToast();

    // Act
    const id = toast.success("Hello world");

    // Assert
    expect(toasts.value.length).toBe(1);
    expect(toasts.value[0]?.message).toBe("Hello world");
    expect(toasts.value[0]?.type).toBe("success");

    // Act 2
    dismiss(id);

    // Assert 2
    expect(toasts.value.length).toBe(0);
  });

  it("should automatically remove toast after duration (Background Teardown)", () => {
    // Arrange
    const { toasts } = useToast();

    // Act
    toast.info("Auto dismiss", { duration: 1000 });

    // Assert
    expect(toasts.value.length).toBe(1);

    // Act 2
    vi.advanceTimersByTime(1050);

    // Assert 2
    expect(toasts.value.length).toBe(0);
  });

  it("should cap the maximum number of toasts to 5 (Spam / Unbounded DOM Growth)", () => {
    // Arrange
    const { toasts } = useToast();

    // Act: Spam 10 toasts
    for (let i = 0; i < 10; i++) {
      toast(`Spam ${i}`);
    }

    // Assert: Only the last 5 should be kept
    expect(toasts.value.length).toBe(5);
    // The oldest 5 should be dropped, so the ones remaining are Spam 5 through Spam 9
    expect(toasts.value[0]?.message).toBe("Spam 5");
    expect(toasts.value[4]?.message).toBe("Spam 9");
  });

  it("should allow description to be a VNode (Description VNode Trap)", () => {
    // Arrange
    const { toasts } = useToast();
    const vnode = h("span", { class: "custom-class" }, "Test");

    // Act
    toast.success("Success", { description: vnode });

    // Assert
    expect(toasts.value[0]?.options?.description).toBe(vnode);
  });

  it("should allow multiline string descriptions (Multiline Texts)", () => {
    // Arrange
    const { toasts } = useToast();
    const desc = "Line 1\nLine 2";

    // Act
    toast.error("Error", { description: desc });

    // Assert
    expect(toasts.value[0]?.options?.description).toBe(desc);
  });
  it("should not forcefully convert success toast to custom when passed a VNode message", () => {
    // Arrange
    const { toasts } = useToast();
    const vnode = h("span", "Hello");

    // Act
    // @ts-expect-error - bypassing strict type for test
    toast.success(vnode);

    // Assert
    expect(toasts.value[0]?.type).toBe("success");
    expect(toasts.value[0]?.component).toBe(vnode);
  });

  it("should correctly clear finite timer when updated to duration Infinity", () => {
    // Arrange
    const { toasts } = useToast();
    const id = "progress-toast";

    // Act 1: Add a toast with finite duration
    toast.info("Starting", { id, duration: 4000 });

    // Fast forward 2 seconds
    vi.advanceTimersByTime(2000);

    // Act 2: Update the toast to be Infinite
    toast.info("Infinite now", { id, duration: Infinity });

    // Fast forward another 3 seconds (past the original 4000ms mark)
    vi.advanceTimersByTime(3000);

    // Assert
    // If the old timer wasn't cleared, the toast would be gone by now
    expect(toasts.value.length).toBe(1);
    expect(toasts.value[0]?.message).toBe("Infinite now");
  });
  it("should maintain independent queues per position with max 5 toasts each", () => {
    // Arrange
    const { toasts } = useToast();

    // Act
    // Spam 10 toasts on the bottom-right
    for (let i = 0; i < 10; i++) {
      toast(`Right ${i}`, { position: "bottom-right" });
    }

    // Add 2 toasts on the bottom-left
    toast("Left 0", { position: "bottom-left" });
    toast("Left 1", { position: "bottom-left" });

    // Assert
    // Total toasts should be 5 (right) + 2 (left) = 7
    expect(toasts.value.length).toBe(7);

    // The right queue should only have the last 5
    const rightToasts = toasts.value.filter((t) => t.position === "bottom-right");
    expect(rightToasts.length).toBe(5);
    expect(rightToasts[0]?.message).toBe("Right 5");
    expect(rightToasts[4]?.message).toBe("Right 9");

    // The left queue should be completely intact
    const leftToasts = toasts.value.filter((t) => t.position === "bottom-left");
    expect(leftToasts.length).toBe(2);
    expect(leftToasts[0]?.message).toBe("Left 0");
    expect(leftToasts[1]?.message).toBe("Left 1");
  });
});
