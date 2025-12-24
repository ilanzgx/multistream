<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Button } from "./components/ui/button";
import KickChat from "./components/KickChat.vue";
import KickStream from "./components/KickStream.vue";
import TwitchChat from "./components/TwitchChat.vue";
import TwitchStream from "./components/TwitchStream.vue";
import YoutubeStream from "./components/YoutubeStream.vue";
import YoutubeChat from "./components/YoutubeChat.vue";
import AddStreamDialog from "./components/AddStreamDialog.vue";
import { UserPlus2, Settings2, Share2, LogOutIcon } from "lucide-vue-next";
import { useStreams } from "./composables/useStreams";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "./components/ui/tooltip";

const sidebarOpen = ref(true);
const addStreamDialogOpen = ref(false);
const selectedStream = ref("");
const { streams, gridClass } = useStreams();

const selectedStreamData = computed(() =>
  streams.value.find((s) => s.channel === selectedStream.value)
);

watch(streams, (newStreams) => {
  if (
    selectedStream.value &&
    !newStreams.some((s) => s.channel === selectedStream.value)
  ) {
    selectedStream.value = "";
  }
});
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-[#191b1f]">
    <!-- main -->
    <main class="flex-1 overflow-hidden bg-[#1f2227]">
      <div v-if="streams.length > 0" class="h-full grid" :class="gridClass">
        <template v-for="(stream, index) in streams" :key="stream.id">
          <KickStream
            v-if="stream.platform === 'kick'"
            :channel="stream.channel"
            :channelid="stream.id"
            :class="{
              'col-span-2 justify-self-center w-1/2':
                streams.length === 3 && index === 2,
            }"
          />
          <TwitchStream
            v-else-if="stream.platform === 'twitch'"
            :channel="stream.channel"
            :channelid="stream.id"
            :class="{
              'col-span-2 justify-self-center w-1/2':
                streams.length === 3 && index === 2,
            }"
          />
          <YoutubeStream
            v-else-if="stream.platform === 'youtube'"
            :channel="stream.channel"
            :channelid="stream.id"
            :class="{
              'col-span-2 justify-self-center w-1/2':
                streams.length === 3 && index === 2,
            }"
          />
        </template>
      </div>
      <div v-else class="flex items-center justify-center h-full">
        <div class="flex flex-col items-center gap-4">
          <h2 class="text-2xl text-white">No streams registered</h2>
          <Button
            class="cursor-pointer"
            variant="outline"
            @click="addStreamDialogOpen = true"
            >Add Stream</Button
          >
        </div>
      </div>
    </main>

    <!-- sidebar -->
    <aside
      class="w-80 shadow-lg transition-all duration-300 flex flex-col"
      :class="{ 'translate-x-full': !sidebarOpen }"
    >
      <!-- stream selector -->
      <div class="p-4 border-b border-[#1f2227]">
        <select
          v-model="selectedStream"
          class="w-full px-3 py-2 border rounded-md bg-background cursor-pointer"
        >
          <option value="">Select stream chat</option>
          <option
            v-for="stream in streams"
            :key="stream.id"
            :value="stream.channel"
          >
            {{ stream.channel }}
          </option>
        </select>
      </div>

      <!-- chat area -->
      <div class="flex-1 overflow-hidden">
        <KickChat
          v-if="selectedStreamData?.platform === 'kick'"
          :channel="selectedStream"
        />
        <TwitchChat
          v-else-if="selectedStreamData?.platform === 'twitch'"
          :channel="selectedStream"
        />
        <YoutubeChat
          v-else-if="selectedStreamData?.platform === 'youtube'"
          :channel="selectedStream"
        />
        <div
          v-else-if="!selectedStream && streams.length > 0"
          class="flex items-center justify-center h-full text-muted-foreground"
        >
          <p class="text-center px-4 text-white">
            Select a stream to view chat.
          </p>
        </div>
        <div
          v-else-if="streams.length === 0"
          class="flex items-center justify-center h-full text-muted-foreground"
        >
          <p class="text-center px-4 text-white">
            No streams available.<br />Add a stream to view chat.
          </p>
        </div>
      </div>

      <!-- action buttons -->
      <div class="p-4 border-t border-t-[#1f2227]">
        <div class="flex justify-center items-center gap-4">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  class="cursor-pointer"
                  variant="outline"
                  @click="addStreamDialogOpen = true"
                >
                  <UserPlus2 class="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Add Stream</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Button class="cursor-pointer" variant="outline">
                  <Settings2 class="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Settings</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Button class="cursor-pointer" variant="outline">
                  <Share2 class="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Share</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  class="cursor-pointer"
                  variant="outline"
                  @click="sidebarOpen = !sidebarOpen"
                >
                  <LogOutIcon class="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Hide</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </aside>

    <!-- toggle button -->
    <Button
      v-if="!sidebarOpen"
      @click="sidebarOpen = true"
      class="fixed text-black right-0 top-1/2 -translate-y-1/2 bg-card border border-r-0 rounded-l-lg px-2 py-8 shadow-lg hover:bg-accent transition-colors"
    >
      ☰
    </Button>

    <!-- add stream dialog -->
    <AddStreamDialog v-model:open="addStreamDialogOpen" />
  </div>
</template>
