<script setup lang="ts">
import { computed } from "vue";
import { CircleCheck, Info, TriangleAlert, OctagonX, X } from "@lucide/vue";
import type { Toast } from "../../../composables/useToast";

const props = defineProps<{
  toast: Toast;
}>();

const emit = defineEmits<{
  (e: "dismiss", id: string | number): void;
}>();

const iconMap = {
  success: CircleCheck,
  info: Info,
  warning: TriangleAlert,
  error: OctagonX,
  default: null,
  custom: null,
};

const colorMap = {
  success: "text-green-400",
  info: "text-blue-400",
  warning: "text-amber-400",
  error: "text-red-400",
  default: "text-gray-400",
  custom: "",
};

const IconComponent = computed(() => iconMap[props.toast.type]);
const iconColor = computed(() => colorMap[props.toast.type]);

function handleAction() {
  if (props.toast.options?.action) {
    props.toast.options.action.onClick();
    emit("dismiss", props.toast.id);
  }
}
</script>

<template>
  <div>
    <div v-if="toast.type === 'custom'" class="pointer-events-auto">
      <component :is="toast.component" />
    </div>
    <div
      v-else
      class="w-89 bg-[#14161a] border border-[#2a2d33] rounded-xl px-4 py-3.5 shadow-lg shadow-black/50 flex flex-col gap-1 pointer-events-auto relative group"
    >
      <div class="flex items-start gap-3">
        <component
          :is="IconComponent"
          v-if="IconComponent"
          class="w-4 h-4 shrink-0 mt-0.5"
          :class="iconColor"
        />
        <div class="flex-1 flex flex-col gap-1">
          <span class="text-[13px] font-medium text-white leading-tight">
            <component :is="toast.component" v-if="toast.component" />
            <template v-else>{{ toast.message }}</template>
          </span>
          <template v-if="toast.options?.description">
            <span
              v-if="typeof toast.options.description === 'string'"
              class="text-xs text-gray-400 leading-snug whitespace-pre-wrap"
            >
              {{ toast.options.description }}
            </span>
            <component :is="toast.options.description" v-else />
          </template>

          <button
            v-if="toast.options?.action"
            class="mt-2 self-start px-3 py-1.5 bg-[#1f2227] hover:bg-[#2a2d33] border border-[#2a2d33] rounded text-xs font-medium text-white transition-colors"
            @click="handleAction"
          >
            {{ toast.options.action.label }}
          </button>
        </div>

        <button
          :aria-label="$t('common.close')"
          class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1 -mt-1 -mr-1 text-gray-500 hover:text-white transition-all rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20 cursor-pointer"
          @click="emit('dismiss', toast.id)"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>
