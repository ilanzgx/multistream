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
import { useStreams, type Platform } from "@/composables/useStreams";
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
    const streamsParam = url.searchParams.get("streams");
    const customParam = url.searchParams.get("c");

    if (!streamsParam && !customParam) {
      toast.error(t("import.invalidLink"));
      return;
    }

    clearStreams();

    // parse regular streams (kick, twitch, youtube)
    if (streamsParam) {
      const streamList = streamsParam.split(",");
      streamList.forEach((stream) => {
        const [platform, channel] = stream.split(":");
        if (platform && channel) {
          addStream(channel, platform as Platform);
        }
      });
    }

    // parse custom streams (Base64 encoded)
    if (customParam) {
      try {
        const customStreams = JSON.parse(atob(customParam)) as {
          n: string;
          u: string;
        }[];
        customStreams.forEach((s) => {
          if (s.u) {
            addStream(s.n || "Custom Stream", "custom", s.u);
          }
        });
      } catch {
        toast.error(t("import.invalidCustom"));
        return;
      }
    }

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
