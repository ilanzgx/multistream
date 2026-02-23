<script lang="ts" setup>
import { Button } from "@/components/ui/button";
import SuggestedStreams from "@/components/main/SuggestedStreams.vue";

const emit = defineEmits<{
  add: [];
}>();
</script>

<template>
  <div class="flex items-center justify-center min-h-full py-12 px-4">
    <div class="flex flex-col items-center gap-4 w-full">
      <h2 class="text-2xl text-white">{{ $t("empty.title") }}</h2>
      <p class="text-gray-400 text-sm text-center max-w-xs">
        {{ $t("empty.description") }}
      </p>
      <Button class="cursor-pointer" variant="outline" @click="emit('add')">{{
        $t("empty.addButton")
      }}</Button>

      <SuggestedStreams />
    </div>
  </div>
</template>
