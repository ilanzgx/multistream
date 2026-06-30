import { ref, computed } from "vue";
import { createSharedComposable } from "@vueuse/core";
import { useStreams, type Stream } from "./useStreams";
import { useFocusedStream } from "./useFocusedStream";

const _useDragAndDrop = () => {
  const draggingId = ref<string | null>(null);
  const overId = ref<string | null>(null);

  const { streams } = useStreams();
  const { focusedStreamId } = useFocusedStream();

  const isDragging = computed(() => draggingId.value !== null);

  const swapStreams = (targetId: string) => {
    if (draggingId.value === null || draggingId.value === targetId) return;

    const fromIndex = streams.value.findIndex((s) => s.id === draggingId.value);
    const toIndex = streams.value.findIndex((s) => s.id === targetId);

    if (fromIndex === -1 || toIndex === -1) return;

    const draggedStream = streams.value[fromIndex] as Stream;
    const targetStream = streams.value[toIndex] as Stream;

    const next = [...streams.value];
    next[fromIndex] = targetStream;
    next[toIndex] = draggedStream;
    streams.value = next;

    if (focusedStreamId.value === draggedStream.id) {
      focusedStreamId.value = targetStream.id;
    } else if (focusedStreamId.value === targetStream.id) {
      focusedStreamId.value = draggedStream.id;
    }
  };

  const onMouseDown = (id: string) => {
    draggingId.value = id;
  };

  const onMouseEnter = (id: string) => {
    if (draggingId.value === null) return;
    overId.value = id;
  };

  const onMouseLeave = () => {
    if (draggingId.value === null) return;
    overId.value = null;
  };

  const onMouseUp = (targetId: string) => {
    if (draggingId.value !== null && overId.value !== null) {
      swapStreams(targetId);
    }
    draggingId.value = null;
    overId.value = null;
  };

  const onGlobalMouseUp = () => {
    draggingId.value = null;
    overId.value = null;
  };

  return {
    draggingId,
    overId,
    isDragging,
    onMouseDown,
    onMouseEnter,
    onMouseLeave,
    onMouseUp,
    onGlobalMouseUp,
  };
};

export const useDragAndDrop = createSharedComposable(_useDragAndDrop);
