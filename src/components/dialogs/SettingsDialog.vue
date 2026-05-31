<script setup lang="ts">
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import Button from "../ui/button/Button.vue";
import { Switch } from "@/components/ui/switch";
import { useUpdater, isTauri } from "@/composables/useUpdater";
import { usePreferences } from "@/composables/usePreferences";
import { RefreshCw, Download, Globe, Bell } from "lucide-vue-next";
import { toast } from "vue-sonner";
import { watch } from "vue";

import { useI18n } from "vue-i18n";
import { SUPPORTED_LANGUAGES } from "@/config/i18n";
import { PLATFORMS } from "@/config/platforms";

const { checkForUpdates, isChecking } = useUpdater();
const { notificationsEnabled } = usePreferences();
const { locale, t } = useI18n();

const isRunningInTauri = isTauri();

const languages = Object.values(SUPPORTED_LANGUAGES);

const changeLanguage = (lang: string) => {
  locale.value = lang;
  localStorage.setItem("locale", lang);
};

defineProps<{
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const handleCheckUpdates = () => {
  checkForUpdates(true);
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

// all platforms except custom
const authPlatforms = Object.values(PLATFORMS).filter((p) => p.id !== "custom");
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="bg-[#14161a] border-[#2a2d33] max-w-xl md:max-w-2xl">
      <DialogHeader>
        <DialogTitle class="text-white">{{ $t("settings.title") }}</DialogTitle>
        <DialogDescription class="text-gray-400">
          {{ $t("settings.description") }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <!-- Updates Section -->
        <div v-if="isRunningInTauri" class="flex items-center justify-between border border-[#2a2d33]/60 bg-[#14161a] p-4 rounded-xl">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center size-10 rounded-lg bg-[#14161a] border border-[#2a2d33]">
              <Download class="size-5 text-gray-400" />
            </div>
            <div>
              <p class="text-white text-sm font-medium">
                {{ $t("settings.updates.title") }}
              </p>
              <p class="text-gray-400 text-xs">
                {{ $t("settings.updates.description") }}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" class="border-[#2a2d33] bg-transparent text-gray-400 hover:text-white hover:bg-white/5 hover:border-[#3a3f4b] transition-all duration-200 active:scale-[0.97]" :disabled="isChecking" @click="handleCheckUpdates">
            <RefreshCw class="size-4 mr-2" :class="{ 'animate-spin': isChecking }" />
            {{ isChecking ? $t("settings.updates.checking") : $t("settings.updates.checkButton") }}
          </Button>
        </div>

        <!-- Language Section -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-[#2a2d33]/60 bg-[#14161a] p-4 rounded-xl">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center size-10 rounded-lg bg-[#14161a] border border-[#2a2d33]">
              <Globe class="size-5 text-gray-400" />
            </div>
            <div>
              <p class="text-white text-sm font-medium">
                {{ $t("settings.language.title") }}
              </p>
              <p class="text-gray-400 text-xs">
                {{ $t("settings.language.description") }}
              </p>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-1 w-full sm:w-auto">
            <button v-for="lang in languages" :key="lang.code" @click="changeLanguage(lang.code)" class="flex items-center justify-center sm:justify-start gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 cursor-pointer" :class="locale === lang.code ? 'bg-[#2a2d33] text-white border border-white/20 shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'">
              <component :is="lang.flag" :size="14" />
              <span>{{ lang.label }}</span>
            </button>
          </div>
        </div>

        <!-- Notifications Section -->
        <div v-if="isRunningInTauri" class="flex items-center justify-between border border-[#2a2d33]/60 bg-[#14161a] p-4 rounded-xl">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center size-10 rounded-lg bg-[#14161a] border border-[#2a2d33]">
              <Bell class="size-5 text-gray-400" />
            </div>
            <div>
              <p class="text-white text-sm font-medium">
                {{ $t("settings.notifications.title") }}
              </p>
              <p class="text-gray-400 text-xs">
                {{ $t("settings.notifications.description") }}
              </p>
            </div>
          </div>
          <Switch v-model="notificationsEnabled" />
        </div>

        <!-- Accounts / Platforms Section -->
        <div class="flex flex-col gap-4 border border-[#2a2d33]/60 bg-[#14161a] p-4 rounded-xl">
          <div class="flex items-center gap-3 pb-1 border-b border-[#2a2d33]/30">
            <div class="flex items-center justify-center size-10 rounded-lg bg-[#14161a] border border-[#2a2d33] shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" class="size-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </div>
            <div>
              <p class="text-white text-sm font-medium">
                {{ $t("settings.auth.title") }}
              </p>
              <p class="text-gray-400 text-xs">
                {{ $t("settings.auth.description") }}
              </p>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button v-for="platform in authPlatforms" :key="platform.id" class="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[#2a2d33] bg-[#14161a] text-xs font-medium text-gray-400 transition-all duration-200 cursor-not-allowed opacity-50" disabled>
              <span :style="{ color: platform.color }" class="shrink-0">
                <component :is="platform.icon" :size="14" />
              </span>
              <span class="text-white font-medium">{{ platform.name }}</span>
              <span class="ml-auto text-[8px] font-mono tracking-wider uppercase px-1.5 py-0.5 rounded text-gray-500 bg-white/5 border border-white/5">
                {{ $t("settings.auth.disconnected") }}
              </span>
            </button>
          </div>
        </div>
      </div>

      <DialogFooter class="pt-5 border-t border-[#2a2d33]/50">
        <DialogClose as-child>
          <Button variant="outline" class="border-[#2a2d33] bg-transparent text-gray-400 hover:text-white hover:bg-white/5 hover:border-[#3a3f4b] transition-all duration-200">
            {{ $t("common.close") }}
          </Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
