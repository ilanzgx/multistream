<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent } from "reka-ui";
import { Smile } from "@lucide/vue";
import {
  useRecentEmotes,
  type PickerEmote,
  type EmoteProvider,
} from "@/composables/useRecentEmotes";
import { type EmoteData } from "@/composables/useEmotes";
import { useVirtualList } from "@vueuse/core";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps<{
  emotes: Map<string, EmoteData>;
}>();

const emit = defineEmits<{
  (e: "select", emote: PickerEmote): void;
}>();

const { recentEmotes, addRecent } = useRecentEmotes();

const isOpen = ref(false);
const searchQuery = ref("");
const activeTab = ref<EmoteProvider | "recent">("recent");

const boundary = ref<HTMLElement | null>(null);

let iframePollInterval: ReturnType<typeof setInterval> | null = null;

const stopIframePoll = () => {
  if (iframePollInterval) {
    clearInterval(iframePollInterval);
    iframePollInterval = null;
  }
};

watch(isOpen, (newVal) => {
  if (newVal) {
    iframePollInterval = setInterval(() => {
      if (document.activeElement?.tagName === "IFRAME") {
        isOpen.value = false;
        // Blur the iframe so that reopening the picker and clicking the iframe again works correctly
        // (though clicking the button to reopen already steals focus, this is extra safe).
        (document.activeElement as HTMLElement).blur();
      }
    }, 100);
  } else {
    stopIframePoll();
  }
});

onMounted(() => {
  boundary.value = document.getElementById("chat-sidebar-bounds");
});

onUnmounted(() => {
  stopIframePoll();
});

const parsedEmotes = computed<PickerEmote[]>(() => {
  const result: PickerEmote[] = [];
  props.emotes.forEach((data, code) => {
    result.push({
      id: `${data.provider}-${code}`,
      name: code,
      url: data.url,
      provider: data.provider,
    });
  });
  return result;
});

const filteredEmotes = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  let list =
    activeTab.value === "recent"
      ? recentEmotes.value.filter((e) => props.emotes.has(e.name))
      : parsedEmotes.value.filter((e) => e.provider === activeTab.value);

  if (query) {
    list = list.filter((e) => e.name.toLowerCase().includes(query));
  }
  return list;
});

const EMOTES_PER_ROW = 8;
const ROW_HEIGHT = 36;

const chunkedEmotes = computed(() => {
  const list = filteredEmotes.value;
  const rows = [];
  for (let i = 0; i < list.length; i += EMOTES_PER_ROW) {
    rows.push({ id: `row-${i}`, items: list.slice(i, i + EMOTES_PER_ROW) });
  }
  return rows;
});

const {
  list: virtualGrid,
  containerProps,
  wrapperProps,
  scrollTo,
} = useVirtualList(chunkedEmotes, {
  itemHeight: ROW_HEIGHT,
});

const setTab = (tab: EmoteProvider | "recent") => {
  activeTab.value = tab;
  scrollTo(0);
};

const handleSelect = (emote: PickerEmote) => {
  addRecent(emote);
  emit("select", emote);
};

const handleOpenChange = (open: boolean) => {
  isOpen.value = open;
  if (open) {
    searchQuery.value = "";
    const validRecents = recentEmotes.value.filter((e) => props.emotes.has(e.name));
    if (validRecents.length === 0) {
      activeTab.value = "channel";
    } else {
      activeTab.value = "recent";
    }
  }
};

const tabs = computed<{ value: EmoteProvider | "recent"; label: string }[]>(() => [
  { value: "recent", label: t("chat.emotes.tabs.recent") },
  { value: "global", label: t("chat.emotes.tabs.global") },
  { value: "channel", label: t("chat.emotes.tabs.channel") },
  { value: "bttv", label: "BTTV" },
  { value: "7tv", label: "7TV" },
]);
</script>

<template>
  <TooltipProvider :delay-duration="100">
    <PopoverRoot :open="isOpen" @update:open="handleOpenChange">
      <PopoverTrigger as-child>
        <Button
          variant="ghost"
          size="icon"
          class="w-8 h-8 text-gray-400 hover:text-gray-200 hover:bg-[#2a2d33] rounded shrink-0 mr-1"
          type="button"
          @click.prevent
        >
          <Smile class="w-4 h-4" />
        </Button>
      </PopoverTrigger>

      <PopoverPortal>
        <PopoverContent
          class="z-50 w-72 rounded-md border border-[#2a2d33] bg-[#0f1115] shadow-lg shadow-black/50 text-gray-200 outline-none p-2 flex flex-col gap-2"
          side="top"
          :side-offset="8"
          align="end"
          :collision-boundary="boundary"
          :collision-padding="8"
          :style="{ maxWidth: 'var(--reka-popover-content-available-width, 288px)' }"
        >
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('chat.emotes.searchEmote')"
            class="w-full bg-[#1a1d24] border border-[#2a2d33] rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500/50 transition-colors"
            autofocus
          />

          <div
            class="flex items-center gap-1 border-b border-[#2a2d33] pb-1 overflow-x-auto hide-scrollbar"
          >
            <button
              v-for="tab in tabs"
              :key="tab.value"
              class="px-2 py-1 text-xs font-medium rounded transition-colors"
              :class="
                activeTab === tab.value
                  ? 'bg-[#2a2d33] text-white'
                  : 'text-gray-400 hover:text-gray-300'
              "
              @click="setTab(tab.value)"
            >
              {{ tab.label }}
            </button>
          </div>

          <div
            v-bind="containerProps"
            class="h-[200px] overflow-y-auto overflow-x-hidden custom-scrollbar pr-2"
          >
            <div v-bind="wrapperProps" class="flex flex-col">
              <div v-for="row in virtualGrid" :key="row.data.id" class="flex gap-1 mb-1">
                <Tooltip
                  v-for="emote in row.data.items"
                  :key="emote.id"
                  :disable-hoverable-content="true"
                >
                  <TooltipTrigger as-child>
                    <button
                      type="button"
                      class="w-8 h-8 flex items-center justify-center rounded hover:bg-[#2a2d33] transition-colors"
                      @click="handleSelect(emote)"
                    >
                      <img
                        :src="emote.url"
                        :alt="emote.name"
                        loading="lazy"
                        class="max-w-[28px] max-h-[28px] object-contain pointer-events-none"
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    :side-offset="4"
                    :hide-arrow="true"
                    class="z-[60] bg-[#1a1d24] border-[#2a2d33] text-gray-200 pointer-events-none"
                  >
                    <p class="text-xs truncate max-w-[120px]">{{ emote.name }}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
            <div
              v-if="filteredEmotes.length === 0"
              class="flex items-center justify-center h-full text-xs text-gray-500"
            >
              {{ t("chat.emotes.noEmotesFound") }}
            </div>
          </div>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  </TooltipProvider>
</template>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #2a2d33;
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #3a3f4b;
}
</style>
