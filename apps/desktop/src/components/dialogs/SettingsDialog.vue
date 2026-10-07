<script setup lang="ts">
import { ref, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { isTauri } from "@/composables/useUpdater";
import { useTranscription } from "@/composables/useTranscription";
import { Settings, Database, Link, Captions, Video, Info } from "@lucide/vue";

import SettingsGeneralTab from "./settings/SettingsGeneralTab.vue";
import SettingsConnectionsTab from "./settings/SettingsConnectionsTab.vue";
import SettingsDataTab from "./settings/SettingsDataTab.vue";
import SettingsResourcesTab from "./settings/SettingsResourcesTab.vue";
import SettingsRecordingTab from "./settings/SettingsRecordingTab.vue";
import SettingsAboutTab from "./settings/SettingsAboutTab.vue";

defineProps<{
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const isRunningInTauri = isTauri();
const { isSupported } = useTranscription();
const isRecordingSupported = ref<boolean>(false);

onMounted(() => {
  if (isRunningInTauri) {
    invoke<boolean>("is_recording_supported_cmd").then((v) => {
      isRecordingSupported.value = v;
    });
  }
});
</script>

<template>
  <Dialog :open="open" :modal="false" @update:open="emit('update:open', $event)">
    <DialogContent
      class="bg-[#14161a] border-[#2a2d33] max-w-2xl md:max-w-3xl flex flex-col h-195 max-h-[90vh]"
    >
      <DialogHeader>
        <DialogTitle class="text-white">
          {{ $t("settings.title") }}
        </DialogTitle>
        <DialogDescription class="text-gray-400">
          {{ $t("settings.description") }}
        </DialogDescription>
      </DialogHeader>

      <Tabs default-value="geral" class="flex flex-col flex-1 overflow-hidden mt-2">
        <TabsList class="w-full flex items-center justify-between bg-[#1e2127] p-1 px-1.5">
          <TabsTrigger
            value="geral"
            class="flex-none flex items-center justify-center gap-1.5 text-xs px-4 py-1.5 text-gray-400 hover:text-white dark:text-gray-400 dark:hover:text-white data-[state=active]:bg-[#2a2d33] data-[state=active]:text-white dark:data-[state=active]:text-white transition-all duration-150"
          >
            <Settings class="size-4 shrink-0" />
            <span class="truncate">{{ $t("settings.tabs.general") }}</span>
          </TabsTrigger>

          <TabsTrigger
            value="dados"
            class="flex-none flex items-center justify-center gap-1.5 text-xs px-4 py-1.5 text-gray-400 hover:text-white dark:text-gray-400 dark:hover:text-white data-[state=active]:bg-[#2a2d33] data-[state=active]:text-white dark:data-[state=active]:text-white transition-all duration-150"
          >
            <Database class="size-4 shrink-0" />
            <span class="truncate">{{ $t("settings.tabs.data") }}</span>
          </TabsTrigger>
          <TabsTrigger
            value="conexoes"
            class="flex-none flex items-center justify-center gap-1.5 text-xs px-4 py-1.5 text-gray-400 hover:text-white dark:text-gray-400 dark:hover:text-white data-[state=active]:bg-[#2a2d33] data-[state=active]:text-white dark:data-[state=active]:text-white transition-all duration-150"
          >
            <Link class="size-4 shrink-0" />
            <span class="truncate">{{ $t("settings.tabs.connections") }}</span>
          </TabsTrigger>
          <TabsTrigger
            v-if="isRunningInTauri && isSupported"
            value="recursos"
            class="flex-none flex items-center justify-center gap-1.5 text-xs px-4 py-1.5 text-gray-400 hover:text-white dark:text-gray-400 dark:hover:text-white data-[state=active]:bg-[#2a2d33] data-[state=active]:text-white dark:data-[state=active]:text-white transition-all duration-150"
          >
            <Captions class="size-4 shrink-0" />
            <span class="truncate">{{ $t("settings.tabs.resources") }}</span>
          </TabsTrigger>
          <TabsTrigger
            v-if="isRunningInTauri && isRecordingSupported"
            value="gravacao"
            class="flex-none flex items-center justify-center gap-1.5 text-xs px-4 py-1.5 text-gray-400 hover:text-white dark:text-gray-400 dark:hover:text-white data-[state=active]:bg-[#2a2d33] data-[state=active]:text-white dark:data-[state=active]:text-white transition-all duration-150"
          >
            <Video class="size-4 shrink-0" />
            <span class="truncate">{{ $t("settings.recording.tabLabel") }}</span>
          </TabsTrigger>
          <TabsTrigger
            value="sobre"
            class="flex-none flex items-center justify-center gap-1.5 text-xs px-4 py-1.5 text-gray-400 hover:text-white dark:text-gray-400 dark:hover:text-white data-[state=active]:bg-[#2a2d33] data-[state=active]:text-white dark:data-[state=active]:text-white transition-all duration-150"
          >
            <Info class="size-4 shrink-0" />
            <span class="truncate">{{ $t("settings.tabs.about") }}</span>
          </TabsTrigger>
        </TabsList>

        <div class="flex-1 overflow-y-auto mt-4 pr-1 scrollbar-thin">
          <SettingsGeneralTab @close="emit('update:open', false)" />
          <SettingsConnectionsTab @close="emit('update:open', false)" />
          <SettingsDataTab @close="emit('update:open', false)" />
          <SettingsResourcesTab v-if="isRunningInTauri && isSupported" />
          <SettingsRecordingTab
            v-if="isRunningInTauri && isRecordingSupported"
            :open="open"
            :is-recording-supported="isRecordingSupported"
          />
          <SettingsAboutTab />
        </div>
      </Tabs>

      <DialogFooter class="pt-5 mt-2 border-t border-[#2a2d33]/50">
        <DialogClose as-child>
          <Button
            variant="outline"
            class="border-[#2a2d33] bg-transparent text-gray-400 hover:text-white hover:bg-white/5 hover:border-[#3a3f4b] transition-all duration-200"
          >
            {{ $t("common.close") }}
          </Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
