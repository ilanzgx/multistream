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
  <TabsContent value="geral" class="space-y-8 mt-0 outline-none">
    <!-- Language Section -->
    <div class="space-y-2">
      <div class="flex items-center gap-2 px-1">
        <Globe class="size-4 text-gray-400" />
        <div>
          <h3 class="text-white text-sm font-medium">
            {{ $t("settings.language.title") }}
          </h3>
          <p class="text-gray-400 text-xs">{{ $t("settings.language.description") }}</p>
        </div>
      </div>
      <div
        class="border border-[#2a2d33]/60 bg-[#14161a] p-3 rounded-xl flex items-center justify-start"
      >
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 w-full">
          <button
            v-for="lang in languages"
            :key="lang.code"
            class="flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium rounded-md transition-all duration-200 cursor-pointer w-full"
            :class="
              locale === lang.code
                ? 'bg-[#2a2d33] text-white border border-white/20 shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
            "
            @click="changeLanguage(lang.code)"
          >
            <component :is="lang.flag" :size="20" class="shrink-0" />
            <span class="w-16 sm:w-20 text-left truncate">{{ lang.name }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Notifications Section -->
    <div v-if="isRunningInTauri" class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-2 px-1">
        <Bell class="size-4 text-gray-400 shrink-0" />
        <div>
          <h3 class="text-white text-sm font-medium">
            {{ $t("settings.notifications.title") }}
          </h3>
          <p class="text-gray-400 text-xs">
            {{ $t("settings.notifications.description") }}
          </p>
        </div>
      </div>
      <div class="shrink-0 flex items-center justify-end">
        <Switch id="notifications-switch" v-model:checked="notificationsEnabled" />
      </div>
    </div>

    <!-- Native Player (Experimental) Section -->
    <div v-if="isRunningInTauri" class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-2 px-1">
        <FlaskConical class="size-4 text-gray-400 shrink-0" />
        <div class="pr-8">
          <h3 class="text-white text-sm font-medium">
            {{ $t("settings.nativePlayer.title") }}
          </h3>
          <p class="text-gray-400 text-xs">
            {{ $t("settings.nativePlayer.description") }}
          </p>
        </div>
      </div>
      <div class="shrink-0 flex items-center justify-end">
        <Switch id="native-player-switch" v-model:checked="nativePlayerEnabled" />
      </div>
    </div>

    <!-- Ad Blocker Section -->
    <div v-if="isRunningInTauri" class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-2 px-1">
        <ShieldCheck class="size-4 text-gray-400 shrink-0" />
        <div class="pr-8">
          <h3 class="text-white text-sm font-medium">
            {{ $t("settings.adblock.title") }}
          </h3>
          <p class="text-gray-400 text-xs">
            {{ $t("settings.adblock.description") }}
          </p>
        </div>
      </div>
      <div class="shrink-0 flex items-center justify-end">
        <Switch id="adblock-switch" v-model:checked="adblockEnabled" />
      </div>
    </div>

    <!-- Updates Section -->
    <div v-if="isRunningInTauri" class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-2 px-1">
        <Download class="size-4 text-gray-400 shrink-0" />
        <div>
          <h3 class="text-white text-sm font-medium">{{ $t("settings.updates.title") }}</h3>
          <p class="text-gray-400 text-xs">{{ $t("settings.updates.description") }}</p>
        </div>
      </div>
      <div class="shrink-0 flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          class="w-52 border-[#2a2d33] bg-[#1e2127] text-gray-300 hover:text-white hover:bg-[#2a2d33] transition-all duration-200"
          :disabled="isChecking"
          @click="handleCheckUpdates"
        >
          <RefreshCw class="size-4 mr-2" :class="{ 'animate-spin': isChecking }" />
          {{ isChecking ? $t("settings.updates.checking") : $t("settings.updates.checkButton") }}
        </Button>
      </div>
    </div>

    <!-- Help / Tour Section -->
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-2 px-1">
        <HelpCircle class="size-4 text-gray-400 shrink-0" />
        <div>
          <h3 class="text-white text-sm font-medium">{{ $t("settings.help.title") }}</h3>
          <p class="text-gray-400 text-xs">{{ $t("settings.help.description") }}</p>
        </div>
      </div>
      <div class="shrink-0 flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          class="w-52 border-[#2a2d33] bg-[#1e2127] text-gray-300 hover:text-white hover:bg-[#2a2d33] transition-all duration-200"
          @click="startTour"
        >
          {{ $t("settings.help.showTourButton") }}
        </Button>
      </div>
    </div>
  </TabsContent>
</template>
