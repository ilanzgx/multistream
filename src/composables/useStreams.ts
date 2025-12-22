import { createSharedComposable, useStorage } from "@vueuse/core";

export type Platform = "kick" | "twitch";

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

  return {
    streams,
    addStream,
    removeStream,
  };
};

export const useStreams = createSharedComposable(_useStreams);
