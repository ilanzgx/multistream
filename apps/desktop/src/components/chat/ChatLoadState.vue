<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { WifiOff } from "@lucide/vue";
import { Skeleton } from "@/components/ui/skeleton";

defineProps<{ error?: unknown }>();
const { t } = useI18n();
</script>

<template>
  <div
    class="flex h-full flex-col items-center justify-center gap-3 bg-[#0f1115] p-6 text-center text-sm text-gray-400"
    role="status"
    :data-testid="error ? 'chat-load-error' : 'chat-loading'"
  >
    <template v-if="error">
      <WifiOff class="h-6 w-6" aria-hidden="true" />
      <p>{{ t("chat.loadError") }}</p>
    </template>
    <div v-else class="flex w-full flex-col gap-2" aria-hidden="true">
      <Skeleton class="h-2.5 w-3/4 mx-auto bg-white/5 rounded" />
      <Skeleton class="h-2.5 w-1/2 mx-auto bg-white/5 rounded" />
      <Skeleton class="h-2.5 w-2/3 mx-auto bg-white/5 rounded" />
    </div>
  </div>
</template>
