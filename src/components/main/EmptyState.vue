<script lang="ts" setup>
import { defineAsyncComponent } from "vue";
const SuggestedStreams = defineAsyncComponent(
  () => import("@/components/main/SuggestedStreams.vue")
);
import { Plus } from "lucide-vue-next";
import { PLATFORMS } from "@/config/platforms";

const emit = defineEmits<{
  add: [];
  tour: [];
}>();

const platforms = Object.values(PLATFORMS).filter((p) => p.id !== "custom");
</script>

<template>
  <div data-testid="empty-state" class="flex items-center justify-center min-h-full py-12 px-4">
    <div class="flex flex-col items-center w-full">
      <!-- title & description -->
      <div class="flex flex-col items-center gap-2 text-center max-w-sm lg:max-w-md">
        <h1 class="text-2xl lg:text-3xl font-bold text-white wrap-break-word">
          {{ $t("empty.title") }}
        </h1>
        <p class="text-gray-400 text-sm lg:text-base wrap-break-word mb-3">
          {{ $t("empty.description") }}
        </p>
      </div>
      <!-- action button with platform icons -->
      <button
        class="group flex items-center gap-3 h-11 pl-4 pr-5 rounded-xl bg-white text-[#14161a] font-semibold cursor-pointer transition-all duration-200 hover:bg-gray-100 hover:scale-105"
        @click="emit('add')"
      >
        <div class="flex items-center gap-2">
          <component
            :is="platform.icon"
            v-for="platform in platforms"
            :key="platform.id"
            :size="15"
            class="text-[#14161a]/60 group-hover:text-[#14161a]/80 transition-colors duration-200"
          />
        </div>
        <span class="w-px h-4 bg-[#14161a]/15" />
        <div class="flex items-center gap-1.5">
          <Plus class="size-4" :stroke-width="2.5" />
          <span class="text-sm">{{ $t("empty.addButton") }}</span>
        </div>
      </button>

      <!-- suggestions -->
      <SuggestedStreams />

      <!-- tour link -->
      <button
        class="mt-2 text-xs text-gray-400 hover:text-gray-300 transition-colors duration-200 cursor-pointer underline underline-offset-4"
        @click="emit('tour')"
      >
        {{ $t("empty.tourLink") }}
      </button>
    </div>
  </div>
</template>
