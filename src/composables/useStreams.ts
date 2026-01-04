import { createSharedComposable, useStorage } from "@vueuse/core";
import { computed } from "vue";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";

export type Platform = "kick" | "twitch" | "youtube";

export interface Stream {
  id: string;
  channel: string;
  platform: Platform;
}

const _useStreams = () => {
  const { t } = useI18n();
  const streams = useStorage<Stream[]>("streams", []);

  const addStream = (channel: string, platform: Platform) => {
    if (
      streams.value.some(
        (s) =>
          s.channel.toLowerCase() === channel.toLowerCase() &&
          s.platform === platform
      )
    ) {
      toast.warning(t("toasts.add.alreadyAdded"));
      return;
    }

    streams.value = [
      ...streams.value,
      {
        id: crypto.randomUUID(),
        channel,
        platform,
      },
    ];

    toast.success(`${channel} ${t("toasts.add.added")}`);
  };

  const removeStream = (id: string) => {
    const stream = streams.value.find((s) => s.id === id);
    streams.value = streams.value.filter((s) => s.id !== id);

    if (stream) {
      toast.success(`${stream.channel} ${t("toasts.remove")}`);
    }
  };

  const clearStreams = () => {
    streams.value = [];
  };

  const gridClass = computed(() => {
    const count = streams.value.length;

    if (count === 1) return "grid-cols-1 grid-rows-1";
    if (count === 2) return "grid-cols-1 grid-rows-2";
    if (count === 3) return "grid-cols-2 grid-rows-2";
    if (count === 4) return "grid-cols-2 grid-rows-2";
    if (count <= 6) return "grid-cols-3 grid-rows-2";
    if (count <= 9) return "grid-cols-3 grid-rows-3";

    return "grid-cols-4 grid-rows-3";
  });

  return {
    streams,
    addStream,
    removeStream,
    clearStreams,
    gridClass,
  };
};

export const useStreams = createSharedComposable(_useStreams);
