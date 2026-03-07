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
    <DialogContent class="bg-[#191b1f] border-[#2a2d33]">
      <DialogHeader>
        <DialogTitle class="text-white">{{ $t("import.title") }}</DialogTitle>
        <DialogDescription class="text-gray-400">
          {{ $t("import.description") }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <input
          v-model="importLink"
          type="text"
          :placeholder="$t('import.placeholder')"
          class="w-full px-3 py-2.5 rounded-lg bg-[#14161a] text-white border border-[#2a2d33] text-sm transition-colors focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 hover:border-[#3a3f4b] placeholder:text-gray-500"
          @keyup.enter="handleImport"
        />
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
        <Button
          @click="handleImport"
          variant="outline"
          class="border-[#2a2d33] bg-[#14161a] text-white hover:text-gray-300 hover:bg-[#1c1f24] hover:border-[#3a3f4b] transition-colors"
          :disabled="!importLink.trim()"
        >
          {{ $t("import.importButton") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
