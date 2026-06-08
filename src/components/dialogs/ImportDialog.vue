<script setup lang="ts">
import { ref } from "vue";
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
import { useStreams } from "@/composables/useStreams";
import { parseUrlOptions } from "@/lib/parseUrlOptions";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

defineProps<{
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const { addStream, clearStreams } = useStreams();

const importLink = ref("");

const handleImport = () => {
  const link = importLink.value.trim();
  if (!link) return;

  try {
    const url = new URL(link);
    const parsedStreams = parseUrlOptions(url.search);

    if (parsedStreams === null) {
      toast.error(t("import.invalidLink"));
      return;
    }

    clearStreams();
    parsedStreams.forEach((s) => addStream(s.channel, s.platform, s.iframeUrl));

    toast.success(t("import.success"));
    importLink.value = "";
    emit("update:open", false);
  } catch {
    toast.error(t("import.invalidLink"));
  }
};
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="bg-[#14161a] border-[#2a2d33]">
      <DialogHeader>
        <DialogTitle class="text-white">
          {{ $t("import.title") }}
        </DialogTitle>
        <DialogDescription class="text-gray-400">
          {{ $t("import.description") }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <input
          v-model="importLink"
          type="text"
          :placeholder="$t('import.placeholder')"
          class="w-full px-3.5 py-2.5 rounded-lg bg-[#0f1115] text-white border border-[#2a2d33] text-sm transition-all duration-200 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 focus:shadow-[0_0_0_3px_rgba(255,255,255,0.06)] hover:border-[#3a3f4b] placeholder:text-gray-500"
          @keyup.enter="handleImport"
        />
      </div>

      <DialogFooter class="pt-5 border-t border-[#2a2d33]/50">
        <DialogClose as-child>
          <Button
            variant="outline"
            class="border-[#2a2d33] bg-transparent text-gray-400 hover:text-white hover:bg-white/5 hover:border-[#3a3f4b] transition-all duration-200"
          >
            {{ $t("common.close") }}
          </Button>
        </DialogClose>
        <Button
          class="bg-white text-[#14161a] font-medium border-transparent hover:bg-gray-200 active:scale-[0.98] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="!importLink.trim()"
          @click="handleImport"
        >
          {{ $t("import.importButton") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
