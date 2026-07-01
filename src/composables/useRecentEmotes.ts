import { ref } from "vue";
import { createSharedComposable, useDebounceFn } from "@vueuse/core";
import { Store, load } from "@tauri-apps/plugin-store";

export type EmoteProvider = "channel" | "7tv" | "bttv" | "global";

export interface PickerEmote {
  id: string;
  name: string;
  url: string;
  provider: EmoteProvider;
}

const MAX_RECENTS = 24;
const STORE_FILENAME = "recent_emotes.json";
const STORE_KEY = "recents";

let store: Store | null = null;

const _useRecentEmotes = () => {
  const recentEmotes = ref<PickerEmote[]>([]);
  const isLoaded = ref(false);

  const initStore = async () => {
    if (isLoaded.value) return;
    try {
      store = await load(STORE_FILENAME, { autoSave: false, defaults: {} } as any);
      const saved = await store.get<PickerEmote[]>(STORE_KEY);
      if (saved && Array.isArray(saved)) {
        recentEmotes.value = saved;
      }
    } catch (e) {
      console.error("Failed to load recent emotes store", e);
    } finally {
      isLoaded.value = true;
    }
  };

  const saveStore = async () => {
    if (!store) return;
    try {
      await store.set(STORE_KEY, recentEmotes.value);
      await store.save();
    } catch (e) {
      console.error("Failed to save recent emotes", e);
    }
  };

  const debouncedSave = useDebounceFn(() => {
    saveStore();
  }, 1000);

  const addRecent = (emote: PickerEmote) => {
    recentEmotes.value = recentEmotes.value.filter((e) => e.name !== emote.name);
    recentEmotes.value.unshift(emote);

    if (recentEmotes.value.length > MAX_RECENTS) {
      recentEmotes.value = recentEmotes.value.slice(0, MAX_RECENTS);
    }

    debouncedSave();
  };

  initStore();

  return {
    recentEmotes,
    addRecent,
    isLoaded,
  };
};

export const useRecentEmotes = createSharedComposable(_useRecentEmotes);
