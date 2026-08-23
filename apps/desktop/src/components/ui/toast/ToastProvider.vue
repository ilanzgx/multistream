<script setup lang="ts">
import { computed } from "vue";
import { useToast, type ToastPosition } from "../../../composables/useToast";
import ToastItem from "./Toast.vue";

const { toasts, dismiss } = useToast();

const positions: ToastPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

const toastsByPosition = computed(() => {
  const grouped = {} as Record<ToastPosition, typeof toasts.value>;
  positions.forEach((p) => (grouped[p] = []));

  toasts.value.forEach((t) => {
    if (t.position.includes("top")) {
      grouped[t.position].unshift(t); // newest at the edge (top)
    } else {
      grouped[t.position].push(t); // newest at the edge (bottom)
    }
  });
  return grouped;
});

function getPositionClasses(pos: ToastPosition) {
  const classes = ["fixed", "z-[9999]", "flex", "flex-col", "gap-2", "pointer-events-none", "w-89"];

  if (pos.includes("top")) classes.push("top-4");
  if (pos.includes("bottom")) classes.push("bottom-4");

  if (pos.includes("left")) classes.push("left-4", "items-start");
  if (pos.includes("right")) classes.push("right-4", "items-end");
  if (pos.includes("center")) classes.push("left-1/2", "-translate-x-1/2", "items-center");

  return classes.join(" ");
}
</script>

<template>
  <div>
    <div v-for="pos in positions" :key="pos" :class="getPositionClasses(pos)">
      <TransitionGroup name="toast" tag="div" class="flex flex-col gap-2 w-full">
        <ToastItem v-for="t in toastsByPosition[pos]" :key="t.id" :toast="t" @dismiss="dismiss" />
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
/* Enter animations */
.toast-enter-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(1rem) scale(0.95);
}
.toast-enter-to {
  opacity: 1;
  transform: translateY(0) scale(1);
}

/* Leave animations: smooth collapse without absolute jumping */
.toast-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}
.toast-leave-from {
  opacity: 1;
  transform: scale(1);
  max-height: 150px; /* Safe upper bound for a toast */
}
.toast-leave-to {
  opacity: 0;
  transform: scale(0.95);
  max-height: 0;
  margin-top: 0;
  margin-bottom: 0;
  padding-top: 0;
  padding-bottom: 0;
  border-width: 0;
}

/* Move animations (FLIP) for when items are reordered or shift naturally */
.toast-move {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
