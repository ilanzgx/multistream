import { computed } from "vue";
import { createSharedComposable } from "@vueuse/core";
import { useStreams } from "./useStreams";
import { useTwitchAuth } from "./useTwitchAuth";

const _useUnifiedChatState = () => {
  const { streams } = useStreams();
  const { authenticated } = useTwitchAuth();

  const unifiedChatState = computed(() => {
    const twitchStreams = streams.value.filter((s) => s.platform === "twitch");
    const kickStreams = streams.value.filter((s) => s.platform === "kick");

    const twitchCount = twitchStreams.length;
    const kickCount = kickStreams.length;
    const totalStreams = twitchCount + kickCount;

    const twitchReadableCount = authenticated.value ? twitchCount : 0;
    const kickReadableCount = kickCount;
    // The Unified Chat feature appears when there are at least 2 streams active in the app.
    // This allows the user to discover the feature and understand why it might not be working.
    const showUnifiedChat = totalStreams >= 2;

    const activePlatforms: ("twitch" | "kick")[] = [];
    if (twitchReadableCount > 0) activePlatforms.push("twitch");
    if (kickReadableCount > 0) activePlatforms.push("kick");

    let warningMessage = "";
    let warningType: "none" | "banner" | "full" = "none";

    if (twitchCount > 0 && !authenticated.value) {
      if (kickCount > 0) {
        warningType = "banner";
        warningMessage = "chat.unified.warningTwitchLoginToMerge";
      } else {
        warningType = "full";
        warningMessage = "chat.unified.warningTwitchLogin";
      }
    }

    return {
      showUnifiedChat,
      activePlatforms,
      warningMessage,
      warningType,
      totalReadable: twitchReadableCount + kickReadableCount,
    };
  });

  return { unifiedChatState };
};

export const useUnifiedChatState = createSharedComposable(_useUnifiedChatState);
