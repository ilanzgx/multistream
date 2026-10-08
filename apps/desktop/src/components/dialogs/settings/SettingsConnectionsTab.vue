<script setup lang="ts">
import { ref, computed } from "vue";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog.vue";
import { PLATFORMS } from "@/config/platforms";
import { useTwitchAuth } from "@/composables/useTwitchAuth";
import { useKickAuth } from "@/composables/useKickAuth";
import { Users, LogOut, Check, Minus, ShieldCheck } from "@lucide/vue";

const emit = defineEmits<{
  (e: "close"): void;
}>();

const {
  authenticated: twitchAuthenticated,
  username: twitchUsername,
  logout: twitchLogout,
} = useTwitchAuth();

const {
  authenticated: kickAuthenticated,
  username: kickUsername,
  logout: kickLogout,
} = useKickAuth();

// All platforms except custom
const authPlatforms = Object.values(PLATFORMS).filter((p) => p.id !== "custom");

const showDisconnectConfirm = ref(false);
const pendingDisconnectPlatform = ref<"twitch" | "kick" | null>(null);

const requestDisconnect = (platformId: "twitch" | "kick") => {
  pendingDisconnectPlatform.value = platformId;
  showDisconnectConfirm.value = true;
};

const confirmDisconnect = () => {
  if (pendingDisconnectPlatform.value === "twitch") {
    twitchLogout();
  } else if (pendingDisconnectPlatform.value === "kick") {
    kickLogout();
  }
  pendingDisconnectPlatform.value = null;
};

const pendingPlatformName = computed(() => {
  if (pendingDisconnectPlatform.value === "twitch") return "Twitch";
  if (pendingDisconnectPlatform.value === "kick") return "Kick";
  return "";
});

const openAuthModal = () => {
  window.dispatchEvent(
    new CustomEvent("multistream-show-dialog", {
      detail: "twitch-auth",
    })
  );
  emit("close");
};

const openKickAuthModal = () => {
  window.dispatchEvent(
    new CustomEvent("multistream-show-dialog", {
      detail: "kick-auth",
    })
  );
  emit("close");
};

const handleConnect = (platformId: string) => {
  if (platformId === "twitch") {
    openAuthModal();
  } else if (platformId === "kick") {
    openKickAuthModal();
  }
};
</script>

<template>
  <TabsContent value="conexoes" class="space-y-6 mt-0 outline-none">
    <!-- Section Header (Title & Description) -->
    <div class="space-y-4">
      <div class="flex items-center gap-2.5 px-0.5">
        <Users class="size-4 text-gray-400 shrink-0" aria-hidden="true" />
        <div class="min-w-0 flex-1">
          <h3 class="text-white text-sm font-medium">{{ $t("settings.auth.title") }}</h3>
          <p class="text-gray-400 text-xs mt-0.5">{{ $t("settings.auth.description") }}</p>
        </div>
      </div>

      <!-- Platforms Cards Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 w-full">
        <div
          v-for="platform in authPlatforms"
          :key="platform.id"
          class="border border-[#2a2d33]/60 bg-[#14161a] hover:border-[#2a2d33] rounded-xl p-4 flex flex-col justify-between transition-all duration-150 h-full"
        >
          <!-- 1. Card Top: Platform Info & Status -->
          <div class="flex items-center justify-between gap-2 pb-3 border-b border-[#2a2d33]/50">
            <div class="flex items-center gap-2 min-w-0 shrink-0">
              <span :style="{ color: platform.color }" class="shrink-0">
                <component :is="platform.icon" :size="16" aria-hidden="true" />
              </span>
              <span class="text-white font-medium text-sm">{{ platform.name }}</span>
            </div>

            <!-- Status Pill -->
            <span
              v-if="
                (platform.id === 'twitch' && twitchAuthenticated) ||
                (platform.id === 'kick' && kickAuthenticated)
              "
              class="inline-flex items-center gap-1.5 text-xs text-gray-300 font-medium px-2 py-0.5 rounded-full bg-[#1e2127] border border-[#2a2d33] shrink-0 whitespace-nowrap"
            >
              <span class="size-1.5 rounded-full bg-emerald-400" aria-hidden="true"></span>
              {{ $t("settings.auth.connected") }}
            </span>
            <span
              v-else-if="platform.id === 'youtube'"
              class="text-xs px-2 py-0.5 rounded-full text-gray-400 bg-[#1e2127] border border-[#2a2d33] font-medium shrink-0 whitespace-nowrap"
            >
              {{ $t("common.comingSoon") }}
            </span>
            <span
              v-else
              class="text-xs text-gray-400 font-medium px-2 py-0.5 rounded-full bg-[#1e2127] border border-[#2a2d33] shrink-0 whitespace-nowrap"
            >
              {{ $t("settings.auth.disconnected") }}
            </span>
          </div>

          <!-- 2. Card Middle: Feature Capabilities -->
          <div class="py-4 flex-1 flex flex-col justify-center">
            <ul class="text-xs space-y-2">
              <li
                class="flex items-center gap-2"
                :class="
                  platform.id === 'youtube'
                    ? 'opacity-30 text-gray-500 select-none'
                    : 'text-gray-300'
                "
              >
                <component
                  :is="platform.id === 'youtube' ? Minus : Check"
                  class="size-3.5 shrink-0"
                  :class="platform.id === 'youtube' ? 'text-gray-600' : 'text-gray-400'"
                  aria-hidden="true"
                />
                <span>{{ $t("settings.auth.features.readChat") }}</span>
              </li>
              <li
                class="flex items-center gap-2"
                :class="
                  platform.id === 'youtube'
                    ? 'opacity-30 text-gray-500 select-none'
                    : 'text-gray-300'
                "
              >
                <component
                  :is="platform.id === 'youtube' ? Minus : Check"
                  class="size-3.5 shrink-0"
                  :class="platform.id === 'youtube' ? 'text-gray-600' : 'text-gray-400'"
                  aria-hidden="true"
                />
                <span>{{ $t("settings.auth.features.sendChat") }}</span>
              </li>
              <li
                class="flex items-center gap-2"
                :class="
                  platform.id === 'twitch'
                    ? 'text-gray-300'
                    : 'opacity-30 text-gray-500 select-none'
                "
              >
                <component
                  :is="platform.id === 'twitch' ? Check : Minus"
                  class="size-3.5 shrink-0"
                  :class="platform.id === 'twitch' ? 'text-gray-400' : 'text-gray-600'"
                  aria-hidden="true"
                />
                <span>{{ $t("settings.auth.features.followedChannels") }}</span>
              </li>
            </ul>
          </div>

          <!-- 3. Card Bottom: Action Button / Connected User Info -->
          <div class="pt-3 border-t border-[#2a2d33]/50">
            <!-- Connected State: Twitch -->
            <div
              v-if="platform.id === 'twitch' && twitchAuthenticated"
              class="flex items-center justify-between gap-2"
            >
              <div
                class="min-w-0 flex-1 flex items-center gap-1.5 text-xs text-white bg-[#1e2127] border border-[#2a2d33] px-2.5 py-1.5 rounded-lg shadow-2xs"
              >
                <span class="text-gray-400 text-xs select-none">@</span>
                <span class="font-medium truncate">{{ twitchUsername }}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="border-[#2a2d33] bg-[#1e2127] text-gray-400 hover:text-red-400 hover:border-red-500/30 hover:bg-[#2a2d33] size-8 p-0 shrink-0 transition-all duration-150 select-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-red-400/20"
                :title="$t('settings.auth.logout')"
                :aria-label="$t('settings.auth.logout')"
                @click="requestDisconnect('twitch')"
              >
                <LogOut class="size-3.5" aria-hidden="true" />
              </Button>
            </div>

            <!-- Connected State: Kick -->
            <div
              v-else-if="platform.id === 'kick' && kickAuthenticated"
              class="flex items-center justify-between gap-2"
            >
              <div
                class="min-w-0 flex-1 flex items-center gap-1.5 text-xs text-white bg-[#1e2127] border border-[#2a2d33] px-2.5 py-1.5 rounded-lg shadow-2xs"
              >
                <span class="text-gray-400 text-xs select-none">@</span>
                <span class="font-medium truncate">{{ kickUsername }}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="border-[#2a2d33] bg-[#1e2127] text-gray-400 hover:text-red-400 hover:border-red-500/30 hover:bg-[#2a2d33] size-8 p-0 shrink-0 transition-all duration-150 select-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-red-400/20"
                :title="$t('settings.auth.logout')"
                :aria-label="$t('settings.auth.logout')"
                @click="requestDisconnect('kick')"
              >
                <LogOut class="size-3.5" aria-hidden="true" />
              </Button>
            </div>

            <!-- Disconnected State: Connect Button -->
            <Button
              v-else-if="platform.id !== 'youtube'"
              type="button"
              variant="outline"
              size="sm"
              class="w-full border-[#2a2d33] bg-[#1e2127] text-gray-200 hover:text-white hover:bg-[#2a2d33] text-xs h-8 font-medium transition-all duration-150 select-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-white/20"
              @click="handleConnect(platform.id)"
            >
              {{ $t("settings.auth.connect") }}
            </Button>

            <!-- YouTube (Coming Soon) -->
            <Button
              v-else
              type="button"
              variant="outline"
              size="sm"
              disabled
              class="w-full border-[#2a2d33]/50 bg-[#1e2127]/40 text-gray-500 text-xs h-8 font-medium cursor-not-allowed opacity-50"
            >
              {{ $t("common.comingSoon") }}
            </Button>
          </div>
        </div>
      </div>

      <!-- Legal & Privacy Disclaimer Card -->
      <div
        class="border border-[#2a2d33]/50 bg-[#14161a] p-3 rounded-xl flex items-start gap-2.5 text-xs text-gray-400 leading-relaxed"
      >
        <ShieldCheck class="size-4 text-gray-500 shrink-0 mt-0.5" aria-hidden="true" />
        <p>{{ $t("settings.auth.disclaimer") }}</p>
      </div>
    </div>
  </TabsContent>

  <!-- Disconnect Confirmation Dialog -->
  <ConfirmDialog
    :open="showDisconnectConfirm"
    :title="$t('settings.auth.disconnectConfirmTitle')"
    :description="
      $t('settings.auth.disconnectConfirmDescription', { platform: pendingPlatformName })
    "
    :confirm-text="$t('settings.auth.disconnectConfirmButton')"
    :cancel-text="$t('common.close')"
    variant="destructive"
    @update:open="showDisconnectConfirm = $event"
    @confirm="confirmDisconnect"
  />
</template>
