<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import Button from "../ui/button/Button.vue";
import { useUpdater, isTauri } from "@/composables/useUpdater";
import { RefreshCw, Download, Globe } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { SUPPORTED_LANGUAGES } from "@/config/i18n";

const { checkForUpdates, isChecking } = useUpdater();
const { locale } = useI18n();

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
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="bg-[#191b1f] border-[#2a2d33]">
      <DialogHeader>
        <DialogTitle class="text-white">{{ $t("settings.title") }}</DialogTitle>
        <DialogDescription class="text-gray-400">
          {{ $t("settings.description") }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <div
          v-if="isRunningInTauri"
          class="flex items-center justify-between border border-[#2a2d33] bg-[#14161a] p-4 rounded-xl"
        >
          <div class="flex items-center gap-3">
            <div
              class="flex items-center justify-center size-10 rounded-lg bg-[#1a1d21] border border-[#2a2d33]"
            >
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
          <Button
            variant="outline"
            size="sm"
            class="border-[#2a2d33] bg-[#14161a] text-white hover:text-gray-300 hover:bg-[#1c1f24] hover:border-[#3a3f4b] transition-colors"
            :disabled="isChecking"
            @click="handleCheckUpdates"
          >
            <RefreshCw
              class="size-4 mr-2"
              :class="{ 'animate-spin': isChecking }"
            />
            {{
              isChecking
                ? $t("settings.updates.checking")
                : $t("settings.updates.checkButton")
            }}
          </Button>
        </div>

        <div
          class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-[#2a2d33] bg-[#14161a] p-4 rounded-xl"
        >
          <div class="flex items-center gap-3">
            <div
              class="flex items-center justify-center size-10 rounded-lg bg-[#1a1d21] border border-[#2a2d33]"
            >
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
            <button
              v-for="lang in languages"
              :key="lang.code"
              @click="changeLanguage(lang.code)"
              class="flex items-center justify-center sm:justify-start gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200"
              :class="
                locale === lang.code
                  ? 'bg-[#2a2d33] text-white border border-white/20 shadow-sm'
                  : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
              "
            >
              <component :is="lang.flag" :size="16" />
              <span class="hidden md:block">{{ lang.label }}</span>
            </button>
          </div>
        </div>
      </div>

      <DialogFooter>
        <DialogClose as-child>
          <Button
            variant="outline"
            class="border-[#2a2d33] bg-[#14161a] text-white hover:text-gray-300 hover:bg-[#1c1f24] hover:border-[#3a3f4b] transition-colors"
          >
            {{ $t("common.close") }}
          </Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
