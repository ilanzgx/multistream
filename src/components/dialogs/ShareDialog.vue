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
    return "No streams to share";
  }

  const url = window.location.origin;
  const streamsParam = streams.value
    .map((s) => `${s.platform}:${s.channel}`)
    .join(",");
  return `${url}?streams=${streamsParam}`;
});

const copyLink = async () => {
  if (!streams.value.length) {
    toast.error("No streams to share");
    return;
  }

  await navigator.clipboard.writeText(shareLink.value);
  toast.success("Link copied to clipboard");
  emit("update:open", false);
};
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="bg-[#191b1f] border-[#2a2d33]">
      <DialogHeader>
        <DialogTitle class="text-white">Share Streams</DialogTitle>
        <DialogDescription class="text-gray-400">
          Share your streams with your friends.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <input
          v-model="shareLink"
          type="text"
          readonly
          class="w-full px-3 py-2.5 rounded-lg bg-[#14161a] text-white border border-[#2a2d33] text-sm transition-colors focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 hover:border-[#3a3f4b] placeholder:text-gray-500"
        />
      </div>

      <DialogFooter>
        <DialogClose as-child>
          <Button
            variant="outline"
            class="border-[#2a2d33] bg-[#14161a] text-white hover:text-gray-300 hover:bg-[#1c1f24] hover:border-[#3a3f4b] transition-colors"
          >
            Cancel
          </Button>
        </DialogClose>
        <Button
          @click="copyLink"
          variant="outline"
          class="border-[#2a2d33] bg-[#14161a] text-white hover:text-gray-300 hover:bg-[#1c1f24] hover:border-[#3a3f4b] transition-colors"
        >
          Copy Link
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
