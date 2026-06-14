<script setup lang="ts">
import { computed } from "vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import Button from "../ui/button/Button.vue";
import { useStreams } from "@/composables/useStreams";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

// props
const props = defineProps<{
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const { streams } = useStreams();

const shareLink = computed(() => {
  if (!streams.value.length) {
    return t("share.noStreams");
  }

  const url =
    window.location.hostname === "localhost"
      ? "https://multistreams-pi.vercel.app"
      : window.location.origin;
  const params: string[] = [];

  // regular streams (kick, twitch, youtube)
  const regularStreams = streams.value.filter((s) => s.platform !== "custom");
  if (regularStreams.length) {
    const streamsParam = regularStreams.map((s) => `${s.platform}:${s.channel}`).join(",");
    params.push(`streams=${streamsParam}`);
  }

  // custom streams - Base64 encoded
  const customStreams = streams.value.filter((s) => s.platform === "custom");
  if (customStreams.length) {
    const customData = customStreams.map((s) => ({
      n: s.channel,
      u: s.iframeUrl || "",
    }));
    params.push(`c=${btoa(JSON.stringify(customData))}`);
  }

  return `${url}?${params.join("&")}`;
});

const copyLink = async () => {
  if (!streams.value.length) {
    toast.error(t("share.noStreams"));
    return;
  }

  await navigator.clipboard.writeText(shareLink.value);
  toast.success(t("share.toast"));
  emit("update:open", false);
};
</script>

<template>
  <Dialog :open="open" :modal="false" @update:open="emit('update:open', $event)">
    <DialogContent class="bg-[#14161a] border-[#2a2d33]">
      <DialogHeader>
        <DialogTitle class="text-white">
          {{ $t("share.title") }}
        </DialogTitle>
        <DialogDescription class="text-gray-400">
          {{ $t("share.description") }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <input
          data-testid="share-link-input"
          :value="shareLink"
          type="text"
          readonly
          class="w-full px-3.5 py-2.5 rounded-lg bg-[#0f1115] text-white border border-dashed border-[#2a2d33] font-mono text-xs transition-all duration-200 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 focus:shadow-[0_0_0_3px_rgba(255,255,255,0.06)] hover:border-[#3a3f4b] placeholder:text-gray-500"
        />
      </div>

      <DialogFooter class="pt-5 border-t border-[#2a2d33]/50">
        <DialogClose as-child>
          <Button
            variant="outline"
            class="border-[#2a2d33] bg-transparent text-gray-400 hover:text-white hover:bg-white/5 hover:border-[#3a3f4b] transition-all duration-200"
          >
            {{ $t("share.cancelButton") }}
          </Button>
        </DialogClose>
        <Button
          data-testid="copy-link-btn"
          class="bg-white text-[#14161a] font-medium hover:bg-gray-200 active:scale-[0.98] transition-all duration-200 border-transparent"
          @click="copyLink"
        >
          {{ $t("share.copyButton") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
