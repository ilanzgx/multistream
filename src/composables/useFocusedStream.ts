import { useStorage, createSharedComposable } from "@vueuse/core";

const _useFocusedStream = () => {
  const focusedStreamId = useStorage<string | null>(
    "multistream-focused-id",
    null,
  );

  /**
   * @brief Toggle focus on a stream
   *
   * If the stream is already focused, it unfocuses it (returns to normal grid).
   * Otherwise, it sets the given stream as the focused one.
   *
   * @param id The stream ID to focus/unfocus
   */
  const toggleFocus = (id: string) => {
    focusedStreamId.value = focusedStreamId.value === id ? null : id;
  };

  /**
   * @brief Check if a stream is focused
   *
   * @param id The stream ID to check
   * @returns true if the stream is the currently focused one
   */
  const isFocused = (id: string) => focusedStreamId.value === id;

  /**
   * @brief Clear focus
   *
   * Resets focus, returning to the normal grid layout.
   */
  const clearFocus = () => {
    focusedStreamId.value = null;
  };

  return {
    focusedStreamId,
    toggleFocus,
    isFocused,
    clearFocus,
  };
};

export const useFocusedStream = createSharedComposable(_useFocusedStream);
