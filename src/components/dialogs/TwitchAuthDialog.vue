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
import { Loader2, Copy, Check, ExternalLink } from "@lucide/vue";
import TwitchIcon from "@/components/icons/TwitchIcon.vue";
import { useTwitchAuth, type DeviceFlowResponse } from "@/composables/useTwitchAuth";
import { useI18n } from "vue-i18n";
import { useClipboard } from "@vueuse/core";
import { open as openUrl } from "@tauri-apps/plugin-shell";

const props = defineProps<{
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const { t } = useI18n();
const { startLogin, cancelLogin, authenticated } = useTwitchAuth();
const { copy, copied } = useClipboard();

const deviceFlow = ref<DeviceFlowResponse | null>(null);
const authError = ref<string | null>(null);

async function startFlow() {
  authError.value = null;
  const flow = await startLogin();
  if (!flow) {
    authError.value = "Failed to initialize login flow.";
    return;
  }
  deviceFlow.value = flow;
}

async function handleCancel() {
  await cancelLogin();
  emit("update:open", false);
}

async function handleOpenLink() {
  if (deviceFlow.value) {
    await openUrl(deviceFlow.value.verification_uri);
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
    } else {
      if (deviceFlow.value && !authenticated.value) {
        cancelLogin();
        deviceFlow.value = null;
      }
    }
  },
  { immediate: true }
);

watch(authenticated, (isAuth) => {
  if (isAuth) {
    if (props.open) {
      emit("update:open", false);
      deviceFlow.value = null;
    }
  }
});

const handleAuthError = (e: Event) => {
  const customEvent = e as CustomEvent<string>;
  authError.value = customEvent.detail;
  deviceFlow.value = null;
};

onMounted(() => {
  window.addEventListener("twitch-auth-error", handleAuthError);
});

onUnmounted(() => {
  window.removeEventListener("twitch-auth-error", handleAuthError);
  if (deviceFlow.value) {
    cancelLogin();
  }
});
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-md bg-[#14161a] border-[#2a2d33] text-white">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2 text-white">
          <TwitchIcon class="w-5 h-5 text-[#bf94ff]" />
          {{ t("chat.unified.connectTitle") }}
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
            {{
              authError === "Expired"
                ? t("chat.unified.auth.expired")
                : t("chat.unified.auth.error") + authError
            }}
          </div>
          <Button
            class="w-full bg-[#bf94ff] hover:bg-[#2a2d33] hover:text-white text-[#14161a] font-semibold transition-colors"
            @click="startFlow"
          >
            {{ t("chat.unified.auth.tryAgain") }}
          </Button>
        </template>

        <template v-else-if="deviceFlow">
          <div class="text-center space-y-2 w-full">
            <p class="text-sm text-gray-400">{{ t("chat.unified.auth.step1") }}</p>
            <Button
              variant="outline"
              class="w-full border-[#2a2d33] text-[#bf94ff] hover:bg-[#2a2d33] hover:text-white hover:border-[#2a2d33] transition-all bg-transparent"
              @click="handleOpenLink"
            >
              {{ deviceFlow.verification_uri }}
              <ExternalLink class="w-4 h-4 ml-2" />
            </Button>
          </div>

          <div class="text-center w-full space-y-2">
            <p class="text-sm text-gray-400">{{ t("chat.unified.auth.step2") }}</p>
            <div class="flex items-center justify-center gap-2 w-full">
              <div
                class="bg-[#1e2127] border border-[#2a2d33] rounded-lg px-6 py-3 font-mono text-2xl tracking-widest text-white select-all w-full text-center"
              >
                {{ deviceFlow.user_code }}
              </div>
              <Button
                variant="outline"
                size="icon"
                class="border-[#2a2d33] bg-[#1e2127] hover:bg-[#2a2d33] hover:text-white text-gray-400 transition-colors"
                @click="copy(deviceFlow.user_code)"
              >
                <Check v-if="copied" class="w-4 h-4 text-green-400" />
                <Copy v-else class="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div class="flex items-center justify-center gap-3 pt-4 text-gray-400">
            <Loader2 class="w-5 h-5 animate-spin text-[#bf94ff]" />
            <span class="text-sm font-medium animate-pulse">{{
              t("chat.unified.auth.waiting")
            }}</span>
          </div>
        </template>

        <template v-else>
          <div class="flex items-center justify-center py-8 text-gray-400">
            <Loader2 class="w-8 h-8 animate-spin text-[#bf94ff]" />
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
