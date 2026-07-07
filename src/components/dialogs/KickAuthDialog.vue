<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, Copy, Check } from "@lucide/vue";
import { useKickAuth } from "@/composables/useKickAuth";
import { useI18n } from "vue-i18n";
import { useClipboard } from "@vueuse/core";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import KickIcon from "@/components/icons/KickIcon.vue";

const props = defineProps<{
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const { t } = useI18n();
const { startLogin, cancelLogin, authenticated, authUrl } = useKickAuth();
const { copy, copied } = useClipboard();

const authError = ref<string | null>(null);

async function startFlow() {
  authError.value = null;
  startLogin(); // This resolves when auth succeeds or fails
}

async function handleCancel() {
  cancelLogin();
  emit("update:open", false);
}

async function handleOpenLink() {
  if (authUrl.value) {
    await openUrl(authUrl.value);
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      if (!authenticated.value) {
        startFlow();
      } else {
        emit("update:open", false);
      }
    }
  },
  { immediate: true }
);

watch(authenticated, (isAuth) => {
  if (isAuth) {
    if (props.open) {
      emit("update:open", false);
    }
  }
});

const handleAuthError = (e: Event) => {
  const customEvent = e as CustomEvent<string>;
  authError.value = customEvent.detail;
};

onMounted(() => {
  window.addEventListener("kick-auth-error", handleAuthError);
});

onUnmounted(() => {
  window.removeEventListener("kick-auth-error", handleAuthError);
});
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-md bg-[#14161a] border-[#2a2d33] text-white">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2 text-white">
          <KickIcon class="w-5 h-5 text-[#53FC18]" />
          {{ t("settings.auth.kickConnect", "Conectar com a Kick") }}
        </DialogTitle>
        <DialogDescription class="text-gray-400">
          {{ t("settings.auth.description") }}
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-col items-center justify-center py-6 space-y-6">
        <template v-if="authError">
          <div
            class="text-red-400 bg-red-400/10 p-4 rounded-lg w-full text-center text-sm border border-red-400/20"
          >
            {{ t("chat.unified.auth.error") }} {{ authError }}
          </div>
          <Button
            class="w-full bg-[#53FC18] hover:bg-[#2a2d33] hover:text-[#53FC18] text-[#14161a] font-semibold transition-colors"
            @click="startFlow"
          >
            {{ t("chat.unified.auth.tryAgain") }}
          </Button>
        </template>

        <template v-else-if="authUrl">
          <div class="text-center space-y-2 w-full">
            <p class="text-sm text-gray-400">{{ t("settings.auth.authorizeBrowser") }}</p>
            <p class="text-xs text-gray-500 mb-4">{{ t("settings.auth.manualLink") }}</p>
            <div class="flex items-center gap-2 w-full">
              <Button
                variant="outline"
                class="flex-1 border-[#2a2d33] text-[#53FC18] hover:bg-[#2a2d33] hover:text-[#53FC18] hover:border-[#2a2d33] transition-all bg-transparent truncate"
                @click="handleOpenLink"
              >
                {{ t("settings.auth.openBrowser") }}
                <ExternalLink class="w-4 h-4 ml-2 shrink-0" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                class="border-[#2a2d33] bg-transparent hover:bg-[#2a2d33] hover:text-white text-gray-400 transition-colors shrink-0"
                @click="copy(authUrl)"
              >
                <Check v-if="copied" class="w-4 h-4 text-green-400" />
                <Copy v-else class="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div class="flex items-center justify-center gap-3 pt-4 text-gray-400">
            <Loader2 class="w-5 h-5 animate-spin text-[#53FC18]" />
            <span class="text-sm font-medium animate-pulse">{{
              t("chat.unified.auth.waiting")
            }}</span>
          </div>
        </template>

        <template v-else>
          <div class="flex items-center justify-center py-8 text-gray-400">
            <Loader2 class="w-8 h-8 animate-spin text-[#53FC18]" />
          </div>
        </template>
      </div>

      <div class="flex justify-end pt-4">
        <Button
          variant="outline"
          class="border-[#2a2d33] text-gray-300 hover:text-white hover:bg-[#2a2d33] bg-transparent"
          @click="handleCancel"
        >
          {{ t("chat.unified.auth.cancel") }}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
