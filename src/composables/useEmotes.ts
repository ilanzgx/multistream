import { ref, reactive } from "vue";
import { createSharedComposable } from "@vueuse/core";

export type EmoteMap = Map<string, string>;

export type ParsedToken =
  | { type: "text"; content: string }
  | { type: "emote"; content: string; code: string };

// --- 3rd Party API Interfaces ---
interface SevenTvEmote {
  id: string;
  name: string;
}

interface SevenTvGlobalResponse {
  emotes?: SevenTvEmote[];
}

interface SevenTvChannelResponse {
  emote_set?: {
    emotes?: SevenTvEmote[];
  };
}

interface BttvEmote {
  id: string;
  code: string;
}

type BttvGlobalResponse = BttvEmote[];

interface BttvChannelResponse {
  channelEmotes?: BttvEmote[];
  sharedEmotes?: BttvEmote[];
}

type RawToken =
  | { type: "text"; content: string }
  | { type: "twitch_emote"; content: string; code: string };

const fetchTwitchId = async (username: string): Promise<string | null> => {
  try {
    const res = await fetch(`https://decapi.me/twitch/id/${username}`);
    if (!res.ok) return null;
    const text = await res.text();
    if (text.includes("User not found")) return null;
    return text.trim();
  } catch (e) {
    console.error(`Failed to fetch Twitch ID for ${username}`, e);
    return null;
  }
};

const _useEmotes = () => {
  const globalEmotes = ref<EmoteMap>(new Map());
  const channelEmotes = reactive<Record<string, EmoteMap>>({});
  const globalEmotesLoaded = ref(false);

  const fetch7TVGlobal = async (): Promise<void> => {
    try {
      const res = await fetch("https://7tv.io/v3/emote-sets/global");
      if (!res.ok) return;
      const data = (await res.json()) as SevenTvGlobalResponse;
      data.emotes?.forEach((emote) => {
        globalEmotes.value.set(emote.name, `https://cdn.7tv.app/emote/${emote.id}/1x.webp`);
      });
    } catch (e) {
      console.error("Failed to load 7TV global emotes", e);
    }
  };

  const fetchBTTVGlobal = async (): Promise<void> => {
    try {
      const res = await fetch("https://api.betterttv.net/3/cached/emotes/global");
      if (!res.ok) return;
      const data = (await res.json()) as BttvGlobalResponse;
      data.forEach((emote) => {
        globalEmotes.value.set(emote.code, `https://cdn.betterttv.net/emote/${emote.id}/1x`);
      });
    } catch (e) {
      console.error("Failed to load BTTV global emotes", e);
    }
  };

  const loadGlobalEmotes = async (): Promise<void> => {
    if (globalEmotesLoaded.value) return;
    await Promise.allSettled([fetch7TVGlobal(), fetchBTTVGlobal()]);
    globalEmotesLoaded.value = true;
  };

  const fetch7TVChannel = async (userId: string, map: EmoteMap): Promise<void> => {
    try {
      const res = await fetch(`https://7tv.io/v3/users/twitch/${userId}`);
      if (!res.ok) return;
      const data = (await res.json()) as SevenTvChannelResponse;
      const emotes = data.emote_set?.emotes;
      if (emotes) {
        emotes.forEach((emote) => {
          map.set(emote.name, `https://cdn.7tv.app/emote/${emote.id}/1x.webp`);
        });
      }
    } catch (e) {
      console.error("Failed to load 7TV channel emotes", e);
    }
  };

  const fetchBTTVChannel = async (userId: string, map: EmoteMap): Promise<void> => {
    try {
      const res = await fetch(`https://api.betterttv.net/3/cached/users/twitch/${userId}`);
      if (!res.ok) return;
      const data = (await res.json()) as BttvChannelResponse;

      const addEmotes = (emotes?: BttvEmote[]) => {
        emotes?.forEach((emote) => {
          map.set(emote.code, `https://cdn.betterttv.net/emote/${emote.id}/1x`);
        });
      };

      addEmotes(data.channelEmotes);
      addEmotes(data.sharedEmotes);
    } catch (e) {
      console.error("Failed to load BTTV channel emotes", e);
    }
  };

  const loadChannelEmotes = async (username: string): Promise<void> => {
    if (channelEmotes[username]) return;

    const userId = await fetchTwitchId(username);
    if (!userId) return;

    channelEmotes[username] = new Map();
    const map = channelEmotes[username];

    await Promise.allSettled([fetch7TVChannel(userId, map), fetchBTTVChannel(userId, map)]);
  };

  const parseMessage = (
    text: string,
    twitchEmotesStr: string | null | undefined,
    channel: string
  ): ParsedToken[] => {
    const tokens: ParsedToken[] = [];

    const emoteReplacements: { start: number; end: number; url: string; code: string }[] = [];
    if (twitchEmotesStr) {
      const emotes = twitchEmotesStr.split("/");
      for (const emote of emotes) {
        const [id, positions] = emote.split(":");
        if (!positions) continue;

        for (const pos of positions.split(",")) {
          const [startStr, endStr] = pos.split("-");
          const start = parseInt(startStr as string, 10);
          const end = parseInt(endStr as string, 10);

          if (start < 0 || end >= text.length) continue;

          const code = text.substring(start, end + 1);
          emoteReplacements.push({
            start,
            end,
            code,
            url: `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0`,
          });
        }
      }
    }

    const kickRegex = /\[emote:(\d+):([^\]]+)\]/g;
    let match;
    while ((match = kickRegex.exec(text)) !== null) {
      const start = match.index;
      const end = kickRegex.lastIndex - 1;
      const id = match[1] || "";
      const code = match[2] || "";
      emoteReplacements.push({
        start,
        end,
        code,
        url: `https://files.kick.com/emotes/${id}/fullsize`,
      });
    }

    emoteReplacements.sort((a, b) => a.start - b.start);

    let currentIndex = 0;
    const rawTokens: RawToken[] = [];

    for (const rep of emoteReplacements) {
      if (rep.start > currentIndex) {
        rawTokens.push({ type: "text", content: text.substring(currentIndex, rep.start) });
      }
      rawTokens.push({ type: "twitch_emote", content: rep.url, code: rep.code });
      currentIndex = rep.end + 1;
    }

    if (currentIndex < text.length) {
      rawTokens.push({ type: "text", content: text.substring(currentIndex) });
    }

    if (rawTokens.length === 0) {
      rawTokens.push({ type: "text", content: text });
    }

    const channelMap = channelEmotes[channel];

    for (const rt of rawTokens) {
      if (rt.type === "twitch_emote") {
        tokens.push({ type: "emote", content: rt.content, code: rt.code });
        continue;
      }

      const words = rt.content.split(/(\s+)/);

      for (const word of words) {
        if (!word) continue;

        let emoteUrl: string | undefined = undefined;

        if (word.trim().length > 0) {
          if (channelMap && channelMap.has(word)) {
            emoteUrl = channelMap.get(word);
          } else if (globalEmotes.value.has(word)) {
            emoteUrl = globalEmotes.value.get(word);
          }
        }

        if (emoteUrl) {
          tokens.push({ type: "emote", content: emoteUrl, code: word });
        } else {
          tokens.push({ type: "text", content: word });
        }
      }
    }

    const mergedTokens: ParsedToken[] = [];
    for (const t of tokens) {
      if (t.type === "text") {
        const last = mergedTokens[mergedTokens.length - 1];
        if (last && last.type === "text") {
          last.content += t.content;
        } else {
          mergedTokens.push({ ...t });
        }
      } else {
        mergedTokens.push(t);
      }
    }

    return mergedTokens;
  };

  loadGlobalEmotes().catch(console.error);

  return {
    loadChannelEmotes,
    parseMessage,
  };
};

export const useEmotes = createSharedComposable(_useEmotes);
