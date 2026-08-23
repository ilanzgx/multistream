<script setup lang="ts">
import type { Component } from "vue";

const props = defineProps<{
  title?: string;
  icon?: Component;
  iconClass?: string;
}>();
</script>

<template>
  <div
    class="w-89 bg-[#14161a] border border-[#2a2d33] rounded-xl! px-4 py-3.5 shadow-lg shadow-black/50 flex flex-col space-y-3"
  >
    <!-- Header -->
    <div v-if="props.title || props.icon || $slots.header" class="flex items-center gap-3">
      <slot name="header">
        <component
          :is="props.icon"
          v-if="props.icon"
          class="size-4 shrink-0"
          :class="props.iconClass || 'text-white'"
        />
        <span v-if="props.title" class="text-[14px] font-semibold text-white tracking-wide">
          {{ props.title }}
        </span>
      </slot>
    </div>

    <!-- Content -->
    <div v-if="$slots.default" class="w-full">
      <slot />
    </div>
  </div>
</template>
