<script setup lang="ts">
import { TabsContent } from "@/components/ui/tabs";
import { PLATFORMS } from "@/config/platforms";
import { useTwitchAuth } from "@/composables/useTwitchAuth";
import { useKickAuth } from "@/composables/useKickAuth";
import { Users, LogOut, Check } from "@lucide/vue";

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

// all platforms except custom
const authPlatforms = Object.values(PLATFORMS).filter((p) => p.id !== "custom");

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
</script>

<template>
  <TabsContent value="conexoes" class="space-y-8 mt-0 outline-none">
    <!-- Accounts / Platforms Section -->
    <div class="space-y-2 relative">
      <div class="flex items-center gap-2 px-1">
        <Users class="size-4 text-gray-400 shrink-0" />
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-white text-sm font-medium">{{ $t("settings.auth.title") }}</h3>
          </div>
          <p class="text-gray-400 text-xs mt-0.5">{{ $t("settings.auth.description") }}</p>
        </div>
      </div>
      <div class="border border-[#2a2d33]/60 bg-[#14161a] p-4 rounded-xl">
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 w-full">
          <div v-for="platform in authPlatforms" :key="platform.id" class="flex flex-col gap-2">
            <template v-if="platform.id === 'twitch'">
              <div
                v-if="twitchAuthenticated"
                class="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[#9146FF]/30 bg-[#9146FF]/10 text-xs font-medium transition-all duration-200"
              >
                <span :style="{ color: platform.color }" class="shrink-0">
                  <component :is="platform.icon" :size="14" />
                </span>
                <span class="text-white font-medium truncate max-w-25">{{ twitchUsername }}</span>
                <button
                  class="ml-auto text-gray-400 hover:text-red-400 p-1 rounded transition-colors"
                  :title="$t('settings.auth.logout')"
                  @click="twitchLogout"
                >
                  <LogOut class="w-3.5 h-3.5" />
                </button>
              </div>
              <button
                v-else
                class="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[#2a2d33] bg-[#1e2127] hover:bg-[#2a2d33] text-xs font-medium text-gray-300 transition-all duration-200 w-full"
                @click="openAuthModal"
              >
                <span :style="{ color: platform.color }" class="shrink-0">
                  <component :is="platform.icon" :size="14" />
                </span>
                <span class="text-white font-medium">{{ platform.name }}</span>
                <span
                  class="ml-auto text-[8px] tracking-wider uppercase px-1.5 py-0.5 rounded text-gray-300 bg-white/10 border border-white/10"
                >
                  {{ $t("chat.unified.connectButton") }}
                </span>
              </button>

              <ul class="text-[10px] text-gray-400 space-y-1 ml-1">
                <li class="flex items-center gap-1.5">
                  <Check class="size-3 text-gray-400" />
                  {{ $t("settings.auth.features.readChat") }}
                </li>
                <li class="flex items-center gap-1.5">
                  <Check class="size-3 text-gray-400" />
                  {{ $t("settings.auth.features.sendChat") }}
                </li>
                <li class="flex items-center gap-1.5">
                  <Check class="size-3 text-gray-400" />
                  {{ $t("settings.auth.features.followedChannels") }}
                </li>
              </ul>
            </template>

            <template v-else-if="platform.id === 'kick'">
              <div
                v-if="kickAuthenticated"
                class="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[#53FC18]/30 bg-[#53FC18]/10 text-xs font-medium transition-all duration-200"
              >
                <span :style="{ color: platform.color }" class="shrink-0">
                  <component :is="platform.icon" :size="14" />
                </span>
                <span class="text-white font-medium truncate max-w-25">{{ kickUsername }}</span>
                <button
                  class="ml-auto text-gray-400 hover:text-red-400 p-1 rounded transition-colors"
                  :title="$t('settings.auth.logout')"
                  @click="kickLogout"
                >
                  <LogOut class="w-3.5 h-3.5" />
                </button>
              </div>
              <button
                v-else
                class="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[#2a2d33] bg-[#1e2127] hover:bg-[#2a2d33] text-xs font-medium text-gray-300 transition-all duration-200 w-full"
                @click="openKickAuthModal"
              >
                <span :style="{ color: platform.color }" class="shrink-0">
                  <component :is="platform.icon" :size="14" />
                </span>
                <span class="text-white font-medium">{{ platform.name }}</span>
                <span
                  class="ml-auto text-[8px] tracking-wider uppercase px-1.5 py-0.5 rounded text-gray-300 bg-white/10 border border-white/10"
                >
                  {{ $t("chat.unified.connectButton") }}
                </span>
              </button>

              <ul class="text-[10px] text-gray-400 space-y-1 ml-1">
                <li class="flex items-center gap-1.5">
                  <Check class="size-3 text-gray-400" />
                  {{ $t("settings.auth.features.readChat") }}
                </li>
                <li class="flex items-center gap-1.5">
                  <Check class="size-3 text-gray-400" />
                  {{ $t("settings.auth.features.sendChat") }}
                </li>
              </ul>
            </template>

            <template v-else>
              <button
                class="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[#2a2d33] bg-[#1e2127] text-xs font-medium text-gray-400 transition-all duration-200 cursor-not-allowed opacity-35 w-full"
                disabled
              >
                <span :style="{ color: platform.color }" class="shrink-0">
                  <component :is="platform.icon" :size="14" />
                </span>
                <span class="text-white font-medium">{{ platform.name }}</span>
                <span
                  class="ml-auto text-[8px] tracking-wider uppercase px-1.5 py-0.5 rounded text-gray-400 bg-white/5 border border-white/5"
                >
                  {{ $t("common.comingSoon") }}
                </span>
              </button>
            </template>
          </div>
        </div>
      </div>
      <p class="text-[11px] text-gray-400 px-1 pt-1 leading-relaxed">
        {{ $t("settings.auth.disclaimer") }}
      </p>
    </div>
  </TabsContent>
</template>
