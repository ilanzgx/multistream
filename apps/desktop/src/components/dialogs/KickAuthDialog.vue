<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { toast } from "@/composables/useToast";

const props = defineProps<{
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const { t } = useI18n();
const { startLogin, cancelLogin, authenticated, authUrl, username } = useKickAuth();
const { copy, copied } = useClipboard();

const authError = ref<string | null>(null);

async function startFlow() {
  authError.value = null;
  startLogin(); // This resolves when auth succeeds or fails
}

async function handleCancel() {
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
    } else {
      if (!authenticated.value) {
        cancelLogin();
      }
    }
  },
  { immediate: true }
);

watch(authenticated, (isAuth) => {
  if (isAuth) {
    if (props.open) {
      toast.success(t("chat.unified.auth.successTitle", { platform: "Kick" }), {
        description: t("chat.unified.auth.successDesc", {
          username: username.value || t("chat.unified.auth.defaultUser"),
        }),
        duration: 10000,
      });
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
  if (!authenticated.value) {
    cancelLogin();
  }
});
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent
      class="sm:max-w-md w-full overflow-hidden bg-[#14161a] border-[#2a2d33] text-white"
    >
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2 text-white">
          <KickIcon class="size-5 text-[#53FC18] shrink-0" />
          <span>{{ t("settings.auth.kickConnect") }}</span>
        </DialogTitle>
        <DialogDescription class="text-xs text-gray-400">
          {{ t("settings.auth.description") }}
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-col items-center justify-center py-5 space-y-5 w-full min-w-0">
        <template v-if="authError">
          <div
            class="text-red-400 bg-red-400/10 p-3.5 rounded-xl w-full text-center text-xs border border-red-400/20 leading-relaxed"
          >
            {{ t("chat.unified.auth.error") + authError }}
          </div>
          <Button
            class="w-full bg-[#53FC18] hover:bg-[#43e60c] text-[#0f1115] font-medium text-sm transition-colors active:scale-[0.98]"
            @click="startFlow"
          >
            {{ t("chat.unified.auth.tryAgain") }}
          </Button>
        </template>

        <template v-else-if="authUrl">
          <div class="space-y-2 w-full text-left min-w-0">
            <p class="text-xs font-medium text-gray-300">
              {{ t("settings.auth.authorizeBrowser") }}
            </p>

            <div class="flex items-center gap-2 w-full min-w-0">
              <Button
                variant="outline"
                class="flex-1 min-w-0 h-10 border-[#2a2d33] bg-[#0f1115] text-[#53FC18] hover:bg-[#1a1c23] hover:text-[#67ff32] hover:border-[#3a3f4b] transition-all text-xs font-mono justify-between px-3.5 overflow-hidden"
                :title="authUrl"
                @click="handleOpenLink"
              >
                <span class="truncate min-w-0 flex-1 text-left">{{ authUrl }}</span>
                <ExternalLink class="size-3.5 ml-2 shrink-0 text-gray-400" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                :aria-label="t('share.copyButton')"
                :title="t('share.copyButton')"
                class="size-10 border-[#2a2d33] bg-[#0f1115] hover:bg-[#1a1c23] hover:text-white text-gray-400 hover:border-[#3a3f4b] transition-colors shrink-0 rounded-lg"
                @click="copy(authUrl)"
              >
                <Check v-if="copied" class="size-4 text-emerald-400" />
                <Copy v-else class="size-4" />
              </Button>
            </div>
          </div>

          <div class="flex items-center justify-center gap-2 pt-2 text-gray-400">
            <Loader2 class="size-4 animate-spin text-[#53FC18]" />
            <span class="text-xs text-gray-400 font-medium">{{
              t("chat.unified.auth.waiting")
            }}</span>
          </div>
        </template>

        <template v-else>
          <div class="flex items-center justify-center py-8 text-gray-400">
            <Loader2 class="size-7 animate-spin text-[#53FC18]" />
          </div>
        </template>
      </div>

      <DialogFooter class="pt-4 border-t border-[#2a2d33]/50 sm:justify-end">
        <Button
          variant="outline"
          class="border-[#2a2d33] bg-transparent text-gray-400 hover:text-white hover:bg-white/5 hover:border-[#3a3f4b] transition-all duration-200 text-xs h-9 px-4"
          @click="handleCancel"
        >
          {{ t("chat.unified.auth.cancel") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
