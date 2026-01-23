<script setup lang="ts">
import { ref } from "vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useStreams, type Platform } from "@/composables/useStreams";
import KickIcon from "@/components/icons/KickIcon.vue";
import TwitchIcon from "@/components/icons/TwitchIcon.vue";
import YoutubeIcon from "@/components/icons/YoutubeIcon.vue";

// props
defineProps<{
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const { addStream } = useStreams();

// local state
const channelName = ref("");
const selectedPlatform = ref<Platform>("kick");

const handleAddStream = () => {
  let channel = channelName.value.trim();

  // if it's a url
  if (channel.includes(".com") || channel.includes(".tv")) {
    try {
      const url = new URL(channel);

      // detect platform from URL
      if (url.hostname.includes("youtube")) {
        selectedPlatform.value = "youtube";
      } else if (url.hostname.includes("twitch")) {
        selectedPlatform.value = "twitch";
      } else if (url.hostname.includes("kick")) {
        selectedPlatform.value = "kick";
      }

      // extract channel/video based on platform
      if (selectedPlatform.value === "youtube") {
        const videoId = url.searchParams.get("v");
        if (videoId) {
          // youtube.com/watch?v=VIDEO_ID
          channel = videoId;
        } else {
          // youtube.com/live/VIDEO_ID or youtube.com/@channel/live
          const pathParts = url.pathname.split("/").filter(Boolean);
          channel = pathParts.pop() || channel;
        }
      } else {
        // kick.com/channel or twitch.tv/channel
        const pathParts = url.pathname.split("/").filter(Boolean);
        channel = pathParts.pop() || channel;
      }
    } catch {
      // if not a valid URL, try to extract manually
      const parts = channel.split("/").filter(Boolean);
      channel = parts.pop() || channel;
      channel = channel.split("?")[0] || channel;
    }
  }

  if (!channel) {
    return;
  }

  addStream(channel, selectedPlatform.value);

  channelName.value = "";
  selectedPlatform.value = "kick";
  emit("update:open", false);
};
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="bg-[#191b1f] border-[#2a2d33]">
      <DialogHeader>
        <DialogTitle class="text-white">{{ $t("add.title") }}</DialogTitle>
        <DialogDescription class="text-gray-400">
          {{ $t("add.description") }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <!-- platform selector with icons -->
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-300">{{
            $t("add.platform")
          }}</label>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="platform in ['kick', 'twitch', 'youtube'] as Platform[]"
              :key="platform"
              type="button"
              @click="selectedPlatform = platform"
              class="flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors cursor-pointer"
              :class="[
                selectedPlatform === platform
                  ? 'bg-[#2a2d33] border-primary'
                  : 'bg-[#14161a] border-[#2a2d33] hover:border-[#3a3f4b]',
              ]"
            >
              <KickIcon
                v-if="platform === 'kick'"
                :size="24"
                class="text-[#53FC18]"
              />
              <TwitchIcon
                v-else-if="platform === 'twitch'"
                :size="24"
                class="text-[#9146FF]"
              />
              <YoutubeIcon
                v-else-if="platform === 'youtube'"
                :size="24"
                class="text-[#FF0000]"
              />
              <span class="text-xs text-white capitalize">{{ platform }}</span>
            </button>
          </div>
        </div>

        <!-- channel name -->
        <div class="space-y-2">
          <label
            v-if="selectedPlatform === 'kick' || selectedPlatform === 'twitch'"
            class="text-sm font-medium text-gray-300"
            >{{ $t("add.channelLabel") }}</label
          >
          <label v-else class="text-sm font-medium text-gray-300">{{
            $t("add.videoIdLabel")
          }}</label>
          <input
            v-model="channelName"
            type="text"
            :placeholder="$t('add.placeholder')"
            class="w-full px-3 py-2.5 rounded-lg bg-[#14161a] text-white border border-[#2a2d33] text-sm transition-colors focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 hover:border-[#3a3f4b] placeholder:text-gray-500"
            @keyup.enter="handleAddStream"
          />
        </div>
      </div>

      <DialogFooter>
        <DialogClose as-child>
          <Button
            variant="outline"
            class="border-[#2a2d33] bg-[#14161a] text-white hover:text-gray-300 hover:bg-[#1c1f24] hover:border-[#3a3f4b] transition-colors"
          >
            {{ $t("common.close") }}
          </Button>
        </DialogClose>
        <Button
          variant="outline"
          class="border-[#2a2d33] bg-[#14161a] text-white hover:text-gray-300 hover:bg-[#1c1f24] hover:border-[#3a3f4b] transition-colors"
          @click="handleAddStream"
          :disabled="!channelName.trim()"
        >
          {{ $t("add.addButton") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
