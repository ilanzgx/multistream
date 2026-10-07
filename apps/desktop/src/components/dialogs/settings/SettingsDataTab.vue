<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBackup, type BackupData } from "@/composables/useBackup";
import { isTauri } from "@/composables/useUpdater";
import { toast } from "@/composables/useToast";
import { Database, Upload, Download } from "@lucide/vue";

const emit = defineEmits<{
  (e: "close"): void;
}>();

const { t } = useI18n();
const { exportConfig, importConfig, validateBackupData } = useBackup();

const isRunningInTauri = isTauri();
const showImportConfirm = ref(false);
const pendingBackupData = ref<BackupData | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

const triggerFileInput = () => {
  fileInputRef.value?.click();
};

const handleExport = async () => {
  const success = await exportConfig();
  if (success) {
    toast.success(t("settings.backup.exportSuccess"));
    emit("close");
  }
};

const processImportContent = (content: string) => {
  try {
    const data = JSON.parse(content);
    if (validateBackupData(data)) {
      pendingBackupData.value = data;
      showImportConfirm.value = true;
    } else {
      toast.error(t("settings.backup.importError"));
    }
  } catch {
    toast.error(t("settings.backup.importError"));
  }
};

const handleImportClick = async () => {
  if (isRunningInTauri && (window as any).__TAURI_INTERNALS__) {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const { downloadDir } = await import("@tauri-apps/api/path");

      const dlDir = await downloadDir();

      const filePath = await open({
        defaultPath: dlDir,
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (filePath && typeof filePath === "string") {
        const content = await readTextFile(filePath);
        processImportContent(content);
        return;
      } else {
        return; // User cancelled
      }
    } catch (err: any) {
      console.error("Tauri native open failed, falling back to html input:", err);
    }
  }
  // Fallback to web native input
  triggerFileInput();
};

const handleFileImport = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", (event) => {
    if (typeof event.target?.result === "string") {
      processImportContent(event.target.result);
    } else {
      toast.error(t("settings.backup.importError"));
    }
    input.value = "";
  });
  reader.addEventListener("error", () => {
    toast.error(t("settings.backup.importError"));
    input.value = "";
  });
  reader.readAsText(file);
};

const confirmImport = () => {
  if (pendingBackupData.value) {
    importConfig(pendingBackupData.value);
    toast.success(t("settings.backup.importSuccess"));
    pendingBackupData.value = null;
    showImportConfirm.value = false;
    emit("close");
  }
};

const cancelImport = () => {
  pendingBackupData.value = null;
  showImportConfirm.value = false;
};
</script>

<template>
  <TabsContent value="dados" class="space-y-8 mt-0 outline-none">
    <!-- Data & Backup Section -->
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-2 px-1">
        <Database class="size-4 text-gray-400 shrink-0" />
        <div>
          <h3 class="text-white text-sm font-medium">{{ $t("settings.backup.title") }}</h3>
          <p class="text-gray-400 text-xs">{{ $t("settings.backup.description") }}</p>
        </div>
      </div>
      <div class="shrink-0 flex items-center justify-end gap-2">
        <input
          ref="fileInputRef"
          type="file"
          accept=".json"
          class="hidden"
          @change="handleFileImport"
        />
        <Button
          variant="outline"
          size="sm"
          class="border-[#2a2d33] bg-[#1e2127] text-gray-300 hover:text-white hover:bg-[#2a2d33] transition-all duration-200"
          @click="handleImportClick"
        >
          <Upload class="size-4 mr-2" />
          {{ $t("settings.backup.importButton") }}
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="border-[#2a2d33] bg-[#1e2127] text-gray-300 hover:text-white hover:bg-[#2a2d33] transition-all duration-200"
          @click="handleExport"
        >
          <Download class="size-4 mr-2" />
          {{ $t("settings.backup.exportButton") }}
        </Button>
      </div>
    </div>
  </TabsContent>

  <!-- Confirm Import Dialog -->
  <Dialog v-model:open="showImportConfirm" :modal="false">
    <DialogContent class="bg-[#14161a] border-[#2a2d33] max-w-md">
      <DialogHeader>
        <DialogTitle class="text-white">
          {{ $t("settings.backup.importConfirmTitle") }}
        </DialogTitle>
        <DialogDescription class="text-gray-400">
          {{ $t("settings.backup.importConfirmDescription") }}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter class="pt-4 border-t border-[#2a2d33]/50 flex gap-2 justify-end">
        <Button
          variant="outline"
          class="border-[#2a2d33] bg-transparent text-gray-400 hover:text-white hover:bg-white/5 hover:border-[#3a3f4b] transition-all duration-200"
          @click="cancelImport"
        >
          {{ $t("settings.backup.importConfirmCancel") }}
        </Button>
        <Button
          class="bg-[#ea580c] hover:bg-[#c2410c] text-white border-transparent transition-all duration-200 active:scale-[0.97]"
          @click="confirmImport"
        >
          {{ $t("settings.backup.importConfirmButton") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
