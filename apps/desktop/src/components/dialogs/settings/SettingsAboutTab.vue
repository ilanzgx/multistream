<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useUpdater, isTauri } from "@/composables/useUpdater";
import { APP_LINKS } from "@/config/links";
import { RefreshCw, Star, MessageSquare, Globe, Download } from "@lucide/vue";

const emit = defineEmits<{
  (e: "close"): void;
}>();

const { checkForUpdates, isChecking } = useUpdater();
const { locale } = useI18n();

const isRunningInTauri = isTauri();
const appVersion = import.meta.env.VITE_APP_VERSION || "0.18.17";

const formattedBuildDate = computed(() => {
  const raw = import.meta.env.VITE_APP_BUILD_TIME;
  if (!raw) return "-";
  try {
    return new Date(raw).toLocaleString(locale.value, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return raw.slice(0, 19).replace("T", ", ");
  }
});

const handleCheckUpdates = () => {
  checkForUpdates(true);
};

const handleOpenChangelog = () => {
  window.dispatchEvent(
    new CustomEvent("multistream-show-dialog", {
      detail: "changelog",
    })
  );
  emit("close");
};

const openExternalLink = async (url: string) => {
  if (isRunningInTauri) {
    try {
      const { open: openUrl } = await import("@tauri-apps/plugin-shell");
      await openUrl(url);
      return;
    } catch (e) {
      console.error("Failed to open URL via Tauri plugin-shell:", e);
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
};
</script>

<template>
  <TabsContent value="sobre" class="space-y-4 mt-0 outline-none">
    <!-- App Identity Header -->
    <div class="flex items-center gap-4 px-1 py-1">
      <img
        src="/128x128.png"
        alt="Multistream logo"
        class="w-14 h-14 rounded-2xl shrink-0 border border-[#2a2d33] bg-[#14161a]"
      />
      <div class="min-w-0">
        <h3 class="text-white text-base font-bold">Multistream</h3>
        <p class="text-xs text-gray-400 mt-0.5 leading-relaxed">
          {{ $t("settings.about.appDescription") }}
        </p>
      </div>
    </div>

    <!-- Details Card -->
    <div class="border border-[#2a2d33]/60 bg-[#14161a] p-4 rounded-xl space-y-3.5 text-xs">
      <!-- Version & Check Updates -->
      <div class="flex items-center gap-6">
        <span class="w-28 text-gray-400 shrink-0">{{ $t("settings.about.version") }}</span>
        <div class="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            data-testid="open-changelog-btn"
            :title="$t('changelog.viewButton')"
            :aria-label="`${appVersion} - ${$t('changelog.viewButton')}`"
            class="h-6 text-xs px-2.5 border-[#2a2d33] bg-[#1e2127] text-gray-300 hover:text-white hover:bg-[#2a2d33] transition-all tabular-nums"
            @click="handleOpenChangelog"
          >
            {{ appVersion }}
          </Button>
          <Button
            v-if="isRunningInTauri"
            variant="outline"
            size="sm"
            class="h-6 text-xs px-2.5 border-[#2a2d33] bg-[#1e2127] text-gray-300 hover:text-white hover:bg-[#2a2d33] transition-all"
            :disabled="isChecking"
            @click="handleCheckUpdates"
          >
            <RefreshCw class="size-3 mr-1.5" :class="{ 'animate-spin': isChecking }" />
            {{ isChecking ? $t("settings.updates.checking") : $t("settings.updates.checkButton") }}
          </Button>
        </div>
      </div>

      <!-- Build Date -->
      <div class="flex items-center gap-6">
        <span class="w-28 text-gray-400 shrink-0">{{ $t("settings.about.buildDate") }}</span>
        <span class="text-gray-300">{{ formattedBuildDate }}</span>
      </div>

      <!-- License -->
      <div class="flex items-center gap-6">
        <span class="w-28 text-gray-400 shrink-0">{{ $t("settings.about.license") }}</span>
        <span class="text-gray-300">{{ $t("settings.about.licenseType") }}</span>
      </div>

      <!-- Links -->
      <div class="flex items-center gap-6 pt-0.5">
        <span class="w-28 text-gray-400 shrink-0">{{ $t("settings.about.links") }}</span>
        <div class="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <button
            class="inline-flex items-center gap-1.5 text-gray-300 hover:text-white transition-colors cursor-pointer group"
            @click="openExternalLink(APP_LINKS.github.repo)"
          >
            <Star class="size-3.5 text-gray-400 group-hover:text-amber-400 transition-colors" />
            <span class="group-hover:underline">{{ $t("settings.about.starGithub") }}</span>
            <span class="text-gray-500 text-xs">=</span>
            <img
              src="/GIGACHAD-1x.gif"
              alt="GIGACHAD"
              title="GIGACHAD"
              class="w-4 h-4 object-contain rounded-xs shrink-0"
            />
          </button>
          <button
            class="inline-flex items-center gap-1.5 text-gray-300 hover:text-white hover:underline transition-colors cursor-pointer"
            @click="openExternalLink(APP_LINKS.github.issues)"
          >
            <MessageSquare class="size-3.5 text-gray-400" />
            <span>{{ $t("settings.about.feedback") }}</span>
          </button>
          <button
            class="inline-flex items-center gap-1.5 text-gray-300 hover:text-white hover:underline transition-colors cursor-pointer"
            @click="openExternalLink(APP_LINKS.website)"
          >
            <Globe class="size-3.5 text-gray-400" />
            <span>{{ $t("settings.about.website") }}</span>
          </button>
          <button
            class="inline-flex items-center gap-1.5 text-gray-300 hover:text-white hover:underline transition-colors cursor-pointer"
            @click="openExternalLink(APP_LINKS.github.extensionZip)"
          >
            <Download class="size-3.5 text-gray-400" />
            <span>{{ $t("settings.about.extension") }}</span>
          </button>
        </div>
      </div>
    </div>
  </TabsContent>
</template>
