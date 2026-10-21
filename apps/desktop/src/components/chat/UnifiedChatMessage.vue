<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { UnifiedChatMessage } from "@/composables/useUnifiedChat";
import type { KickChatMessage } from "@/composables/useKickChat";
import { useEmotes, type ParsedToken } from "@/composables/useEmotes";
import { Sword, Crown, Gem, Star, Reply, CornerDownRight } from "@lucide/vue";
import TwitchIcon from "@/components/icons/TwitchIcon.vue";
import KickIcon from "@/components/icons/KickIcon.vue";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { useTwitchAuth } from "@/composables/useTwitchAuth";
import { useKickAuth } from "@/composables/useKickAuth";

const props = withDefaults(
  defineProps<{
    message: (UnifiedChatMessage | KickChatMessage) & {
      isPending?: boolean;
      reply?: UnifiedChatMessage["reply"];
    };
    channelColor: string;
    channelAvatar?: string;
    compact?: boolean;
    showPlatformIcon?: boolean;
    isPending?: boolean;
    canReply?: boolean;
    canMention?: boolean;
    currentUsername?: string | null;
  }>(),
  {
    compact: false,
    showPlatformIcon: false,
    canReply: false,
    canMention: false,
  }
);

const emit = defineEmits<{
  reply: [message: UnifiedChatMessage | KickChatMessage];
  mention: [displayName: string];
}>();

const { username: twitchUsername } = useTwitchAuth();
const { username: kickUsername } = useKickAuth();

const activeUsername = computed(() => {
  if (props.currentUsername) return props.currentUsername;
  return props.message.platform === "kick" ? kickUsername.value : twitchUsername.value;
});

const isMentionedOrReplied = computed(() => {
  const myName = activeUsername.value;
  if (!myName) return false;
  const lowerMyName = myName.toLowerCase();

  // Never highlight user's own messages
  if (props.message.username?.toLowerCase() === lowerMyName) return false;

  // 1. Replied to user
  if (props.message.reply) {
    if (
      props.message.reply.parent_username?.toLowerCase() === lowerMyName ||
      props.message.reply.parent_display_name?.toLowerCase() === lowerMyName
    ) {
      return true;
    }
  }

  // 2. Mentioned in message (@username or @display_name)
  const msgText = props.message.message;
  if (!msgText || !msgText.includes("@")) return false;

  const escaped = lowerMyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(^|\\s|[^a-zA-Z0-9_])@${escaped}(\\b|[^a-zA-Z0-9_]|$)`, "i");
  return regex.test(msgText);
});

// Own messages keep a `local-*` id (Twitch never echoes them), so they have no real parent id to reply to.
const isReplyable = computed(
  () =>
    Boolean(props.canReply) &&
    !props.isPending &&
    !props.message.isPending &&
    Boolean(props.message.id) &&
    !props.message.id.startsWith("local-")
);

const { parseMessage } = useEmotes();

const parsedTokens = computed(() => {
  return parseMessage(props.message.message, props.message.emotes ?? null, props.message.channel);
});

// Twitch IRC prepends `@target_username ` to reply messages for legacy IRC clients,
// but modern clients (Twitch Web/Mobile) keep this mention implicit and omit it from the body.
const displayTokens = computed<ParsedToken[]>(() => {
  const tokens = parsedTokens.value;
  if (!props.message.reply || tokens.length === 0) return tokens;

  const reply = props.message.reply;
  const rawTargets = [reply.parent_username, reply.parent_display_name].filter((s): s is string =>
    Boolean(s && s.trim().length > 0)
  );

  if (rawTargets.length === 0) return tokens;

  const escapedTargets = rawTargets.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const prefixRegex = new RegExp(`^@(?:${escapedTargets.join("|")})[,:]?\\s*`, "i");

  const firstToken = tokens[0];
  if (!firstToken || firstToken.type !== "text" || !prefixRegex.test(firstToken.content)) {
    return tokens;
  }

  const strippedContent = firstToken.content.replace(prefixRegex, "");
  if (strippedContent.length === 0) {
    return tokens.slice(1);
  }

  const updatedToken: ParsedToken = { type: "text", content: strippedContent };
  return [updatedToken, ...tokens.slice(1)];
});

const cleanParentMessage = computed(() => {
  const raw = props.message.reply?.parent_message;
  if (!raw) return "";
  const cleaned = raw.replace(/^@[a-zA-Z0-9_]+[,:]?\s*/, "").trim();
  return cleaned || raw;
});

const { t } = useI18n();

const parsedBadges = computed(() => {
  const badges = [];
  // Ensure we have an array (just in case the backend sent null or something)
  for (const b of props.message.badges || []) {
    const type = b.split("/")[0];
    if (type === "broadcaster")
      badges.push({
        type,
        icon: Crown,
        color: "text-red-500 fill-red-500/20",
        label: t("chat.badges.broadcaster"),
      });
    else if (type === "moderator")
      badges.push({
        type,
        icon: Sword,
        color: "text-green-500 fill-green-500/20",
        label: t("chat.badges.moderator"),
      });
    else if (type === "vip")
      badges.push({
        type,
        icon: Gem,
        color: "text-pink-400 fill-pink-400/20",
        label: t("chat.badges.vip"),
      });
    else if (type === "subscriber" || type === "founder")
      badges.push({
        type,
        icon: Star,
        color: "text-purple-400 fill-purple-400/20",
        label: t("chat.badges.subscriber"),
      });
  }
  return badges;
});

const nameColor = computed(() => props.message.color || "#e5e7eb"); // Default to gray-200

const handleLinkClick = async (url: string) => {
  try {
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
};
</script>

<template>
  <div
    class="message-row group relative px-3 py-1.5 transition-colors"
    :class="[
      isMentionedOrReplied
        ? props.message.platform === 'kick'
          ? 'bg-[#53fc18]/10 hover:bg-[#53fc18]/15'
          : 'bg-[#9146FF]/10 hover:bg-[#9146FF]/15'
        : 'hover:bg-white/[0.03]',
      { 'opacity-60': props.isPending || props.message.isPending },
    ]"
  >
    <!-- Mention / Reply Left Highlight Indicator -->
    <div
      v-if="isMentionedOrReplied"
      class="absolute left-0 top-0 bottom-0 w-[3px]"
      :class="props.message.platform === 'kick' ? 'bg-[#53fc18]' : 'bg-[#9146FF]'"
    />
    <!-- Channel Color Left Indicator -->
    <div
      v-else-if="!props.compact"
      class="absolute left-0 top-0 bottom-0 w-[3px] opacity-70"
      :style="{ backgroundColor: props.channelColor }"
    />

    <div
      v-if="props.message.reply"
      class="flex items-center gap-1 mb-0.5 text-[11px] text-gray-500 min-w-0"
      :class="{ 'pl-1': !props.compact }"
      data-testid="chat-reply-context"
    >
      <CornerDownRight class="w-3 h-3 shrink-0" />
      <span class="font-semibold text-gray-300 shrink-0">{{
        props.message.reply.parent_display_name
      }}</span>
      <span class="truncate">{{ cleanParentMessage }}</span>
    </div>

    <!-- Action Button (Reply) -->
    <button
      v-if="isReplyable"
      type="button"
      class="absolute right-1.5 top-1 hidden group-hover:flex items-center justify-center w-5 h-5 rounded bg-[#1f232b] hover:bg-[#2a2f3a] text-gray-400 hover:text-gray-100 border border-white/10 shadow-xs transition-colors z-10"
      :title="t('chat.reply')"
      :aria-label="t('chat.reply')"
      data-testid="chat-reply-button"
      @click="emit('reply', props.message)"
    >
      <Reply class="w-2.5 h-2.5" />
    </button>

    <div class="flex items-start gap-2" :class="{ 'pl-1': !props.compact }">
      <template v-if="!props.compact">
        <!-- Channel Avatar -->
        <img
          v-if="props.channelAvatar"
          :src="props.channelAvatar"
          :alt="props.message.channel"
          :title="$t('chat.streamTooltip', { channel: props.message.channel })"
          class="w-[18px] h-[18px] rounded-full object-cover mt-[1px] shrink-0 border border-white/5"
          loading="lazy"
          decoding="async"
        />
        <div
          v-else
          class="w-[18px] h-[18px] rounded-full mt-[1px] shrink-0 border border-white/5 flex items-center justify-center text-[8px] font-bold text-white/50 uppercase"
          :style="{ backgroundColor: props.channelColor + '40' }"
          :title="$t('chat.streamTooltip', { channel: props.message.channel })"
        >
          {{ props.message.channel.charAt(0) }}
        </div>
      </template>

      <!-- Message Content -->
      <p class="text-sm leading-relaxed break-words text-gray-300 flex-1 min-w-0">
        <!-- Platform Icon (Only shown in Unified Chat View) -->
        <span v-if="props.showPlatformIcon" class="inline-flex items-center mr-1.5 align-[-0.1em]">
          <TwitchIcon v-if="props.message.platform === 'twitch'" class="w-3 h-3 text-[#9146FF]" />
          <KickIcon
            v-else-if="props.message.platform === 'kick'"
            :size="12"
            :style="{ color: '#53fc18' }"
          />
        </span>

        <!-- Badges -->
        <component
          :is="badge.icon"
          v-for="badge in parsedBadges"
          :key="badge.type"
          :class="['inline-block w-4 h-4 mr-1 align-[-0.2em]', badge.color]"
          :title="badge.label"
          stroke-width="2.5"
        />

        <!-- User Name -->
        <span
          class="font-bold mr-1 inline-flex items-center gap-1 align-baseline"
          :class="{ 'cursor-pointer hover:underline': props.canMention }"
          :style="{ color: nameColor }"
          :title="props.canMention ? t('chat.mention') : undefined"
          @click="props.canMention ? emit('mention', props.message.display_name) : undefined"
        >
          {{ props.message.display_name }}<span class="text-gray-400">:</span>
        </span>

        <!-- Tokens -->
        <template v-for="(token, index) in displayTokens" :key="index">
          <span v-if="token.type === 'text'">{{ token.content }}</span>
          <a
            v-else-if="token.type === 'link'"
            :href="token.url"
            class="text-blue-400 hover:text-blue-300 hover:underline transition-colors break-all cursor-pointer"
            @click.prevent.stop="handleLinkClick(token.url)"
            >{{ token.content }}</a
          >
          <img
            v-else
            :src="token.content"
            :alt="token.code"
            :title="token.code"
            class="inline-block object-contain mx-0.5 align-middle"
            style="height: 1.5em; max-width: 100%"
            loading="lazy"
            decoding="async"
          />
        </template>
      </p>
    </div>
  </div>
</template>
