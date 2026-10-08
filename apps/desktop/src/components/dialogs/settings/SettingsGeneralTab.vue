<script setup lang="ts">
import { watch } from "vue";
import { useI18n } from "vue-i18n";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useUpdater, isTauri } from "@/composables/useUpdater";
import { usePreferences } from "@/composables/usePreferences";
import { toast } from "@/composables/useToast";
import { SUPPORTED_LANGUAGES } from "@/config/i18n";
import {
  Globe,
  Bell,
  FlaskConical,
  ShieldCheck,
  Download,
  RefreshCw,
  HelpCircle,
} from "@lucide/vue";

const emit = defineEmits<{
  (e: "close"): void;
}>();

const { locale, t } = useI18n();
const { notificationsEnabled, nativePlayerEnabled, adblockEnabled } = usePreferences();
const { checkForUpdates, isChecking } = useUpdater();

const isRunningInTauri = isTauri();
const languages = Object.values(SUPPORTED_LANGUAGES);

const changeLanguage = (lang: string) => {
  locale.value = lang;
  localStorage.setItem("locale", lang);
};

const handleCheckUpdates = () => {
  checkForUpdates(true);
};

const startTour = () => {
  window.dispatchEvent(
    new CustomEvent("multistream-show-dialog", {
      detail: "onboarding-tour",
    })
  );
  emit("close");
};

watch(notificationsEnabled, (enabled) => {
  if (enabled) {
    toast.success(t("settings.notifications.enabled"), {
      duration: 2000,
    });
  } else {
    toast.info(t("settings.notifications.disabled"), {
      duration: 2000,
    });
  }
});

watch(adblockEnabled, (enabled) => {
  if (enabled) {
    toast.success(t("settings.adblock.toastEnabled"), {
      duration: 2000,
    });
  } else {
    toast.info(t("settings.adblock.toastDisabled"), {
      duration: 2000,
    });
  }
});
</script>

<template>
  <TabsContent value="geral" class="space-y-6 mt-0 outline-none">
    <!-- Language Selection -->
    <section class="space-y-3">
      <div class="flex items-center gap-2.5 px-0.5">
        <Globe class="size-4 text-gray-400 shrink-0" aria-hidden="true" />
        <div class="min-w-0 flex-1">
          <h3 class="text-white text-sm font-medium">
            {{ $t("settings.language.title") }}
          </h3>
          <p class="text-gray-400 text-xs mt-0.5">{{ $t("settings.language.description") }}</p>
        </div>
      </div>

      <div
        class="border border-[#2a2d33]/60 bg-[#14161a] p-2 rounded-xl grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5"
      >
        <button
          v-for="lang in languages"
          :key="lang.code"
          type="button"
          :aria-pressed="locale === lang.code"
          class="flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer w-full select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 active:scale-[0.98]"
          :class="
            locale === lang.code
              ? 'bg-[#2a2d33] text-white border border-white/10 shadow-xs'
              : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
          "
          @click="changeLanguage(lang.code)"
        >
          <component
            :is="lang.flag"
            :size="18"
            class="shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.32)]"
            aria-hidden="true"
          />
          <span class="w-16 sm:w-20 text-left truncate">{{ lang.name }}</span>
        </button>
      </div>
    </section>

    <!-- Desktop Preferences -->
    <div class="space-y-6 border-t border-[#2a2d33]/50 pt-6">
      <template v-if="isRunningInTauri">
        <!-- Notifications -->
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-2.5 px-0.5 min-w-0 flex-1">
            <Bell class="size-4 text-gray-400 shrink-0" aria-hidden="true" />
            <div class="min-w-0 flex-1">
              <h3 class="text-white text-sm font-medium">
                {{ $t("settings.notifications.title") }}
              </h3>
              <p class="text-gray-400 text-xs mt-0.5">
                {{ $t("settings.notifications.description") }}
              </p>
            </div>
          </div>
          <div class="shrink-0">
            <Switch
              id="notifications-switch"
              v-model:checked="notificationsEnabled"
              :aria-label="$t('settings.notifications.title')"
            />
          </div>
        </div>

        <!-- Native Player -->
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-2.5 px-0.5 min-w-0 flex-1">
            <FlaskConical class="size-4 text-gray-400 shrink-0" aria-hidden="true" />
            <div class="min-w-0 flex-1">
              <h3 class="text-white text-sm font-medium">
                {{ $t("settings.nativePlayer.title") }}
              </h3>
              <p class="text-gray-400 text-xs mt-0.5">
                {{ $t("settings.nativePlayer.description") }}
              </p>
            </div>
          </div>
          <div class="shrink-0">
            <Switch
              id="native-player-switch"
              v-model:checked="nativePlayerEnabled"
              :aria-label="$t('settings.nativePlayer.title')"
            />
          </div>
        </div>

        <!-- Ad Blocker -->
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-2.5 px-0.5 min-w-0 flex-1">
            <ShieldCheck class="size-4 text-gray-400 shrink-0" aria-hidden="true" />
            <div class="min-w-0 flex-1">
              <h3 class="text-white text-sm font-medium">
                {{ $t("settings.adblock.title") }}
              </h3>
              <p class="text-gray-400 text-xs mt-0.5">
                {{ $t("settings.adblock.description") }}
              </p>
            </div>
          </div>
          <div class="shrink-0">
            <Switch
              id="adblock-switch"
              v-model:checked="adblockEnabled"
              :aria-label="$t('settings.adblock.title')"
            />
          </div>
        </div>

        <!-- Software Updates -->
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-2.5 px-0.5 min-w-0 flex-1">
            <Download class="size-4 text-gray-400 shrink-0" aria-hidden="true" />
            <div class="min-w-0 flex-1">
              <h3 class="text-white text-sm font-medium">{{ $t("settings.updates.title") }}</h3>
              <p class="text-gray-400 text-xs mt-0.5">{{ $t("settings.updates.description") }}</p>
            </div>
          </div>
          <div class="shrink-0">
            <Button
              variant="outline"
              size="sm"
              class="w-44 sm:w-52 border-[#2a2d33] bg-[#1e2127] text-gray-300 hover:text-white hover:bg-[#2a2d33] transition-all duration-150 active:scale-[0.98] select-none focus-visible:ring-2 focus-visible:ring-white/20"
              :disabled="isChecking"
              @click="handleCheckUpdates"
            >
              <RefreshCw
                class="size-4 mr-2"
                :class="{ 'animate-spin': isChecking }"
                aria-hidden="true"
              />
              {{
                isChecking ? $t("settings.updates.checking") : $t("settings.updates.checkButton")
              }}
            </Button>
          </div>
        </div>
      </template>

      <!-- Help / Onboarding Tour -->
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-2.5 px-0.5 min-w-0 flex-1">
          <HelpCircle class="size-4 text-gray-400 shrink-0" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <h3 class="text-white text-sm font-medium">{{ $t("settings.help.title") }}</h3>
            <p class="text-gray-400 text-xs mt-0.5">{{ $t("settings.help.description") }}</p>
          </div>
        </div>
        <div class="shrink-0">
          <Button
            variant="outline"
            size="sm"
            class="w-44 sm:w-52 border-[#2a2d33] bg-[#1e2127] text-gray-300 hover:text-white hover:bg-[#2a2d33] transition-all duration-150 active:scale-[0.98] select-none focus-visible:ring-2 focus-visible:ring-white/20"
            @click="startTour"
          >
            {{ $t("settings.help.showTourButton") }}
          </Button>
        </div>
      </div>
    </div>
  </TabsContent>
</template>
