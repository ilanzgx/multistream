import { createSharedComposable, useStorage } from "@vueuse/core";
import { computed } from "vue";

export type Platform = "kick" | "twitch" | "youtube";

export interface Stream {
  id: string;
  channel: string;
  platform: Platform;
}

const _useStreams = () => {
  const streams = useStorage<Stream[]>("streams", []);

  const addStream = (channel: string, platform: Platform) => {
    if (
      streams.value.some(
        (s) =>
          s.channel.toLowerCase() === channel.toLowerCase() &&
          s.platform === platform
      )
    ) {
      console.log("Stream already exists");
      return;
    }

    console.log("Adding stream");
    streams.value = [
      ...streams.value,
      {
        id: crypto.randomUUID(),
        channel,
        platform,
      },
    ];
  };

  const removeStream = (id: string) => {
    console.log("Removing stream");
    streams.value = streams.value.filter((s) => s.id !== id);
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
    gridClass,
  };
};

export const useStreams = createSharedComposable(_useStreams);
