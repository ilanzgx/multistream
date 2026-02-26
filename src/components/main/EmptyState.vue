<script lang="ts" setup>
import SuggestedStreams from "@/components/main/SuggestedStreams.vue";
import { Plus } from "lucide-vue-next";
import { PLATFORMS } from "@/config/platforms";

const emit = defineEmits<{
  add: [];
}>();

const platforms = Object.values(PLATFORMS).filter((p) => p.id !== "custom");
</script>

<template>
  <div class="flex items-center justify-center min-h-full py-12 px-4">
    <div class="flex flex-col items-center gap-5 w-full">
      <!-- title & description -->
      <h2 class="text-2xl font-bold text-white">
        {{ $t("empty.title") }}
      </h2>
      <p class="text-gray-500 text-sm text-center max-w-xs">
        {{ $t("empty.description") }}
      </p>

      <!-- action button with platform icons -->
      <button
        class="group flex items-center gap-3 h-11 pl-4 pr-5 rounded-xl bg-white text-[#14161a] font-semibold cursor-pointer transition-all duration-200 hover:bg-gray-100 hover:scale-105"
        @click="emit('add')"
      >
        <div class="flex items-center gap-2">
          <component
            v-for="platform in platforms"
            :key="platform.id"
            :is="platform.icon"
            :size="15"
            class="text-[#14161a]/60 group-hover:text-[#14161a]/80 transition-colors duration-200"
          />
        </div>
        <span class="w-px h-4 bg-[#14161a]/15"></span>
        <div class="flex items-center gap-1.5">
          <Plus class="size-4" :stroke-width="2.5" />
          <span class="text-sm">{{ $t("empty.addButton") }}</span>
        </div>
      </button>

      <!-- suggestions -->
      <SuggestedStreams />
    </div>
  </div>
</template>
