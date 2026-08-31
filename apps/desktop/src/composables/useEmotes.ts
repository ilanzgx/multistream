import { ref, shallowRef, shallowReactive, triggerRef } from "vue";
import { createSharedComposable } from "@vueuse/core";

export type EmoteMap = Map<string, string>;
export type EmoteData = { url: string; provider: "global" | "channel" | "7tv" | "bttv" };

export type ParsedToken =
  | { type: "text"; content: string }
  | { type: "emote"; content: string; code: string }
  | { type: "link"; content: string; url: string };

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

import { API_CONFIG } from "@/config/api";
import { CDN_CONFIG } from "@/config/cdn";

type RawToken =
  | { type: "text"; content: string }
  | { type: "emote"; content: string; code: string }
  | { type: "link"; content: string; url: string };

const URL_REGEX = /(?:https?:\/\/|www\.)[^\s]+/gi;
const KICK_EMOTE_REGEX = /\[emote:(\d+):([^\]]+)\]/g;
const TRAILING_PUNCTUATION_REGEX = /[.,;:!?)]+$/;
const SPLIT_WHITESPACE_REGEX = /(\s+)/;

const MAX_TOKEN_CACHE_SIZE = 1000;
const tokenCache = new Map<string, ParsedToken[]>();
const channelVersions = new Map<string, number>();
let globalVersion = 0;

export const __test_resetEmotesState = (): void => {
  tokenCache.clear();
  channelVersions.clear();
  globalVersion = 0;
};

export const __test_getTokenCacheSize = (): number => {
  return tokenCache.size;
};

const fetchTwitchId = async (username: string): Promise<string | null> => {
  try {
    const res = await fetch(API_CONFIG.decapi.twitchIdUrl(username));
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
  const globalEmotes = shallowRef<EmoteMap>(new Map());
  const channelEmotes = shallowReactive<Record<string, EmoteMap>>({});
  const globalEmotesLoaded = ref(false);

  const kickEmotes = shallowReactive<Record<string, Map<string, string>>>({});
  const kickGlobalEmotes = shallowRef<Map<string, string>>(new Map());
  const kickGlobalEmotesLoaded = ref(false);

  const fetchTwitchGlobal = async (): Promise<void> => {
    try {
      const res = await fetch(API_CONFIG.adamcy.twitchGlobalEmotesUrl);
      if (!res.ok) return;
      const data = await res.json();
      data.forEach((e: any) => {
        if (e.urls && e.urls.length > 0) {
          globalEmotes.value.set(e.code, e.urls[0].url);
        }
      });
    } catch (e) {
      console.error("Failed to load Twitch global emotes", e);
    }
  };

  const fetch7TVGlobal = async (): Promise<void> => {
    try {
      const res = await fetch(API_CONFIG.sevenTv.globalEmotesUrl);
      if (!res.ok) return;
      const data = (await res.json()) as SevenTvGlobalResponse;
      data.emotes?.forEach((emote) => {
        globalEmotes.value.set(emote.name, CDN_CONFIG.sevenTv.emote(emote.id));
      });
    } catch (e) {
      console.error("Failed to load 7TV global emotes", e);
    }
  };

  const fetchBTTVGlobal = async (): Promise<void> => {
    try {
      const res = await fetch(API_CONFIG.bttv.globalEmotesUrl);
      if (!res.ok) return;
      const data = (await res.json()) as BttvGlobalResponse;
      data.forEach((emote) => {
        globalEmotes.value.set(emote.code, CDN_CONFIG.bttv.emote(emote.id));
      });
    } catch (e) {
      console.error("Failed to load BTTV global emotes", e);
    }
  };

  const loadGlobalEmotes = async (): Promise<void> => {
    if (globalEmotesLoaded.value) return;
    await Promise.allSettled([fetchTwitchGlobal(), fetch7TVGlobal(), fetchBTTVGlobal()]);
    globalEmotesLoaded.value = true;
    globalVersion++;
    tokenCache.clear();
    triggerRef(globalEmotes);
  };

  const fetch7TVChannel = async (userId: string, map: EmoteMap): Promise<void> => {
    try {
      const res = await fetch(API_CONFIG.sevenTv.twitchUserEmotesUrl(userId));
      if (!res.ok) return;
      const data = (await res.json()) as SevenTvChannelResponse;
      const emotes = data.emote_set?.emotes;
      if (emotes) {
        emotes.forEach((emote) => {
          map.set(emote.name, CDN_CONFIG.sevenTv.emote(emote.id));
        });
      }
    } catch (e) {
      console.error("Failed to load 7TV channel emotes", e);
    }
  };

  const fetch7TVChannelKick = async (channelSlug: string, map: EmoteMap): Promise<void> => {
    try {
      const res = await fetch(API_CONFIG.sevenTv.kickUserEmotesUrl(channelSlug));
      if (!res.ok) return;
      const data = (await res.json()) as SevenTvChannelResponse;
      const emotes = data.emote_set?.emotes;
      if (emotes) {
        emotes.forEach((emote) => {
          map.set(emote.name, CDN_CONFIG.sevenTv.emote(emote.id));
        });
      }
    } catch (e) {
      console.error("Failed to load 7TV Kick channel emotes", e);
    }
  };

  const fetchBTTVChannel = async (userId: string, map: EmoteMap): Promise<void> => {
    try {
      const res = await fetch(API_CONFIG.bttv.twitchUserEmotesUrl(userId));
      if (!res.ok) return;
      const data = (await res.json()) as BttvChannelResponse;

      const addEmotes = (emotes?: BttvEmote[]) => {
        emotes?.forEach((emote) => {
          map.set(emote.code, CDN_CONFIG.bttv.emote(emote.id));
        });
      };

      addEmotes(data.channelEmotes);
      addEmotes(data.sharedEmotes);
    } catch (e) {
      console.error("Failed to load BTTV channel emotes", e);
    }
  };

  const fetchKickEmotes = async (channelSlug: string): Promise<void> => {
    try {
      const res = await fetch(API_CONFIG.kick.emotesUrl(channelSlug));
      if (!res.ok) return;
      const data = await res.json();

      const map = new Map<string, string>();

      for (const group of data) {
        if (group.id === "Global" || group.id === "Emoji") {
          if (!kickGlobalEmotesLoaded.value) {
            group.emotes?.forEach((e: any) => {
              kickGlobalEmotes.value.set(e.name, e.id.toString());
            });
          }
        } else {
          group.emotes?.forEach((e: any) => {
            map.set(e.name, e.id.toString());
          });
        }
      }

      kickGlobalEmotesLoaded.value = true;
      kickEmotes[channelSlug] = map;
      triggerRef(kickGlobalEmotes);
    } catch (e) {
      console.error("Failed to load Kick channel emotes", e);
    }
  };

  const loadChannelEmotes = async (username: string): Promise<void> => {
    if (channelEmotes[username]) return;

    channelEmotes[username] = new Map();
    const map = channelEmotes[username];

    const promises: Promise<void>[] = [
      fetchKickEmotes(username),
      fetch7TVChannelKick(username, map),
    ];

    const userId = await fetchTwitchId(username);
    if (userId) {
      promises.push(fetch7TVChannel(userId, map));
      promises.push(fetchBTTVChannel(userId, map));
    }

    await Promise.allSettled(promises);
    channelEmotes[username] = new Map(map); // trigger shallowReactive

    const normUser = username.toLowerCase();
    const nextVer = (channelVersions.get(normUser) || 0) + 1;
    channelVersions.set(normUser, nextVer);
    for (const key of tokenCache.keys()) {
      if (key.startsWith(`${normUser}:`)) {
        tokenCache.delete(key);
      }
    }
  };

  const parseMessage = (
    text: string,
    twitchEmotesStr: string | null | undefined,
    channel: string = ""
  ): ParsedToken[] => {
    if (!text) return [];

    const normChannel = channel.toLowerCase();
    const chanVer = channelVersions.get(normChannel) || 0;
    const cacheKey = `${normChannel}:${chanVer}:${globalVersion}:${twitchEmotesStr || ""}:${text}`;

    const cached = tokenCache.get(cacheKey);
    if (cached) {
      return cached.slice();
    }

    const tokens: ParsedToken[] = [];

    const emoteReplacements: { start: number; end: number; url: string; code: string }[] = [];
    if (twitchEmotesStr) {
      const emotes = twitchEmotesStr.split("/");
      for (const emote of emotes) {
        const [id, positions] = emote.split(":");
        if (!id || !positions) continue;

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
            url: CDN_CONFIG.twitch.emote(id),
          });
        }
      }
    }

    KICK_EMOTE_REGEX.lastIndex = 0;
    let kickMatch: RegExpExecArray | null;
    while ((kickMatch = KICK_EMOTE_REGEX.exec(text)) !== null) {
      const start = kickMatch.index;
      const end = KICK_EMOTE_REGEX.lastIndex - 1;
      const id = kickMatch[1] || "";
      const code = kickMatch[2] || "";
      emoteReplacements.push({
        start,
        end,
        code,
        url: CDN_CONFIG.kick.emote(id),
      });
    }

    emoteReplacements.sort((a, b) => a.start - b.start);

    let currentIndex = 0;
    const rawTokens: RawToken[] = [];

    for (const rep of emoteReplacements) {
      if (rep.start > currentIndex) {
        rawTokens.push({ type: "text", content: text.substring(currentIndex, rep.start) });
      }
      rawTokens.push({ type: "emote", content: rep.url, code: rep.code });
      currentIndex = rep.end + 1;
    }

    if (currentIndex < text.length) {
      rawTokens.push({ type: "text", content: text.substring(currentIndex) });
    }

    if (rawTokens.length === 0) {
      rawTokens.push({ type: "text", content: text });
    }

    const channelMap = channelEmotes[normChannel] || channelEmotes[channel];

    for (const rt of rawTokens) {
      if (rt.type === "emote") {
        tokens.push({ type: "emote", content: rt.content, code: rt.code });
        continue;
      }

      const words = rt.content.split(SPLIT_WHITESPACE_REGEX);

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

    const finalTokens: ParsedToken[] = [];

    for (const t of mergedTokens) {
      if (t.type === "text") {
        let lastIndex = 0;
        let urlMatch: RegExpExecArray | null;
        URL_REGEX.lastIndex = 0;

        while ((urlMatch = URL_REGEX.exec(t.content)) !== null) {
          let url = urlMatch[0];
          const start = urlMatch.index;

          const trailingPunctuationMatch = url.match(TRAILING_PUNCTUATION_REGEX);
          if (trailingPunctuationMatch) {
            let punct = trailingPunctuationMatch[0];
            // Don't strip closing parenthesis if the URL contains an opening parenthesis (e.g. Wikipedia links)
            if (punct.includes(")") && url.includes("(")) {
              punct = punct.replace(/\)+$/, "");
            }
            const trailingLen = punct.length;
            if (trailingLen > 0) {
              url = url.substring(0, url.length - trailingLen);
              URL_REGEX.lastIndex -= trailingLen;
            }
          }

          if (start > lastIndex) {
            finalTokens.push({ type: "text", content: t.content.substring(lastIndex, start) });
          }

          let href = url;
          if (href.toLowerCase().startsWith("www.")) {
            href = "https://" + href;
          }

          finalTokens.push({ type: "link", content: url, url: href });
          lastIndex = URL_REGEX.lastIndex;
        }

        if (lastIndex < t.content.length) {
          finalTokens.push({ type: "text", content: t.content.substring(lastIndex) });
        }
      } else {
        finalTokens.push(t);
      }
    }

    if (tokenCache.size >= MAX_TOKEN_CACHE_SIZE) {
      const firstKey = tokenCache.keys().next().value;
      if (firstKey !== undefined) {
        tokenCache.delete(firstKey);
      }
    }
    tokenCache.set(cacheKey, finalTokens.slice());

    return finalTokens;
  };

  const encodeKickMessage = (text: string, channel: string): string => {
    const channelMap = kickEmotes[channel];
    const words = text.split(SPLIT_WHITESPACE_REGEX);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (!word || word.trim().length === 0) continue;

      let emoteId: string | undefined = undefined;

      if (channelMap && channelMap.has(word)) {
        emoteId = channelMap.get(word);
      } else if (kickGlobalEmotes.value.has(word)) {
        emoteId = kickGlobalEmotes.value.get(word);
      }

      if (emoteId) {
        words[i] = `[emote:${emoteId}:${word}]`;
      }
    }

    return words.join("");
  };

  const getEmoteDictionary = (
    channel: string,
    platform: "twitch" | "kick"
  ): Map<string, EmoteData> => {
    const dict = new Map<string, EmoteData>();

    if (platform === "twitch") {
      globalEmotes.value.forEach((url, code) => dict.set(code, { url, provider: "global" }));
      const channelMap = channelEmotes[channel];
      if (channelMap) {
        channelMap.forEach((url, code) => dict.set(code, { url, provider: "channel" }));
      }
    } else if (platform === "kick") {
      globalEmotes.value.forEach((url, code) => {
        if (!url.includes("jtvnw.net")) {
          dict.set(code, { url, provider: "global" });
        }
      });
      kickGlobalEmotes.value.forEach((id, code) => {
        dict.set(code, { url: CDN_CONFIG.kick.emote(id), provider: "global" });
      });
      const kickChannelMap = kickEmotes[channel];
      if (kickChannelMap) {
        kickChannelMap.forEach((id, code) => {
          dict.set(code, {
            url: CDN_CONFIG.kick.emote(id),
            provider: "channel",
          });
        });
      }
      const thirdPartyMap = channelEmotes[channel];
      if (thirdPartyMap) {
        thirdPartyMap.forEach((url, code) => {
          let provider: "7tv" | "bttv" | "channel" = "channel";
          if (url.includes("7tv.app")) provider = "7tv";
          else if (url.includes("betterttv.net")) provider = "bttv";
          dict.set(code, { url, provider });
        });
      }
    }

    return dict;
  };

  loadGlobalEmotes().catch(console.error);

  return {
    loadChannelEmotes,
    parseMessage,
    encodeKickMessage,
    getEmoteDictionary,
  };
};

export const useEmotes = createSharedComposable(_useEmotes);
