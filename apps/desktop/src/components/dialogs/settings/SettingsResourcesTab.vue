<script setup lang="ts">
import { ref } from "vue";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog.vue";
import { useTranscription, CHUNK_STEPS } from "@/composables/useTranscription";
import { isTauri } from "@/composables/useUpdater";
import { Captions, X, Check, Trash2, Download } from "@lucide/vue";

const isRunningInTauri = isTauri();

const {
  isSupported,
  installedModels,
  selectedModel,
  isEnabled,
  captionMode,
  chunkDuration,
  isDownloading,
  downloadingModel,
  downloadProgress,
  downloadModel,
  cancelDownload,
  deleteModel,
  setChunkDuration,
} = useTranscription();

const AVAILABLE_MODELS = [
  { id: "tiny", name: "Tiny", size: "75MB", tKey: "settings.transcription.modelTiny" },
  { id: "base", name: "Base", size: "142MB", tKey: "settings.transcription.modelBase" },
  { id: "small", name: "Small", size: "466MB", tKey: "settings.transcription.modelSmall" },
];

const showDeleteConfirm = ref(false);
const pendingDeleteModelId = ref<string | null>(null);

const requestDeleteModel = (modelId: string) => {
  pendingDeleteModelId.value = modelId;
  showDeleteConfirm.value = true;
};

const confirmDeleteModel = () => {
  if (pendingDeleteModelId.value) {
    deleteModel(pendingDeleteModelId.value);
    pendingDeleteModelId.value = null;
  }
};
</script>

<template>
  <TabsContent
    v-if="isRunningInTauri && isSupported"
    value="recursos"
    class="space-y-8 mt-0 outline-none"
  >
    <!-- Live Transcription Section -->
    <div v-if="isRunningInTauri && isSupported" class="space-y-2">
      <div class="flex items-center gap-2 px-1">
        <Captions class="size-4 text-gray-400 shrink-0" aria-hidden="true" />
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-white text-sm font-medium">
              {{ $t("settings.transcription.title") }}
            </h3>
          </div>
          <p class="text-gray-400 text-xs mt-0.5">
            {{ $t("settings.transcription.description") }}
          </p>
        </div>
      </div>

      <div class="border border-[#2a2d33]/60 bg-[#14161a] p-4 rounded-xl space-y-4">
        <!-- Active Configuration -->
        <div
          v-if="installedModels.length > 0"
          class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#2a2d33]/50"
        >
          <div class="flex items-center gap-2 flex-1">
            <select
              v-model="captionMode"
              data-testid="transcription-mode-select"
              :aria-label="$t('settings.transcription.captionModeLabel')"
              class="bg-[#1e2127] border border-[#2a2d33] text-white text-xs rounded-md px-2 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 w-full max-w-50 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="isDownloading"
            >
              <option value="original">
                {{ $t("settings.transcription.captionModeOriginal") }}
              </option>
              <option value="translate">
                {{ $t("settings.transcription.captionModeTranslate") }}
              </option>
            </select>
            <div class="text-xs text-gray-400">
              {{ $t("settings.transcription.captionModeLabel") }}
            </div>
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <span class="text-xs text-gray-400">{{
              $t("settings.transcription.enableToggle")
            }}</span>
            <Switch
              v-model:checked="isEnabled"
              data-testid="transcription-enable-toggle"
              :aria-label="$t('settings.transcription.enableToggle')"
              :disabled="isDownloading"
            />
          </div>
        </div>

        <!-- Caption Responsiveness slider -->
        <div class="space-y-1">
          <div class="flex items-center justify-between">
            <div class="text-xs font-medium text-gray-400">
              {{ $t("settings.transcription.chunkDurationLabel") }}
            </div>
          </div>
          <div dir="ltr" class="pt-1 pb-0.5">
            <Slider
              :model-value="[chunkDuration]"
              :min="CHUNK_STEPS[0]"
              :max="CHUNK_STEPS[CHUNK_STEPS.length - 1]"
              :step="CHUNK_STEPS[1] - CHUNK_STEPS[0]"
              data-testid="chunk-duration-slider"
              :aria-label="$t('settings.transcription.chunkDurationLabel')"
              class="w-full my-2"
              :disabled="isDownloading"
              @update:model-value="(val) => val && val[0] && setChunkDuration(val[0])"
            />
            <!-- Tick labels -->
            <div class="flex justify-between w-full mt-1.5 px-1">
              <span
                v-for="step in CHUNK_STEPS"
                :key="step"
                class="text-xs transition-colors leading-none"
                :class="step === chunkDuration ? 'text-white font-semibold' : 'text-gray-400'"
                >{{ step }}s</span
              >
            </div>
          </div>
          <p class="text-xs text-gray-400 mt-1 leading-tight">
            {{ $t("settings.transcription.chunkDurationHintLow") }}
            {{ $t("settings.transcription.chunkDurationHintHigh") }}
            <strong class="font-semibold text-gray-300">{{
              $t("settings.transcription.chunkDurationHintRec")
            }}</strong>
          </p>
        </div>

        <!-- Models List -->
        <div class="space-y-2">
          <div class="text-xs font-medium text-gray-400 mb-2">
            {{ $t("settings.transcription.modelLabel") }}
          </div>
          <div
            v-for="model in AVAILABLE_MODELS"
            :key="model.id"
            class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border transition-all duration-150"
            :class="[
              selectedModel === model.id && installedModels.includes(model.id)
                ? 'border-white/20 bg-[#1e2127]/80 shadow-xs'
                : installedModels.includes(model.id)
                  ? 'border-[#2a2d33]/70 bg-[#1e2127]/40 hover:border-[#2a2d33]'
                  : 'border-[#2a2d33]/40 bg-[#14161a]/60 opacity-80 hover:opacity-100 hover:border-[#2a2d33]/70',
            ]"
          >
            <div class="flex-1 min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-semibold text-white">{{ model.name }}</span>
                <span class="text-xs text-gray-400 font-mono">{{ model.size }}</span>
                <span
                  v-if="model.id === 'base'"
                  class="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium"
                >
                  {{ $t("settings.transcription.recommendedBadge") }}
                </span>
                <span
                  v-if="selectedModel === model.id && installedModels.includes(model.id)"
                  class="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium flex items-center gap-1"
                >
                  <Check class="size-3" aria-hidden="true" />
                  {{ $t("settings.transcription.modelInUse") }}
                </span>
              </div>
              <p class="text-xs text-gray-400 mt-1 leading-relaxed">{{ $t(model.tKey) }}</p>
            </div>

            <div class="shrink-0 flex items-center gap-2">
              <template v-if="downloadingModel === model.id">
                <div class="w-32 space-y-1.5">
                  <div class="flex justify-between text-xs text-gray-400">
                    <span>{{ (downloadProgress.downloaded / 1024 / 1024).toFixed(1) }} MB</span>
                    <span>{{ downloadProgress.percent.toFixed(0) }}%</span>
                  </div>
                  <div class="h-1.5 flex items-center gap-2">
                    <div class="h-1.5 flex-1 bg-[#2a2d33] rounded-full overflow-hidden">
                      <div
                        class="h-full bg-blue-500 transition-all duration-300"
                        :style="{ width: `${downloadProgress.percent}%` }"
                      ></div>
                    </div>
                    <button
                      type="button"
                      class="text-gray-400 hover:text-red-400 transition-colors p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                      :title="$t('common.cancel')"
                      :aria-label="$t('common.cancel')"
                      @click="cancelDownload"
                    >
                      <X class="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </template>
              <template v-else-if="installedModels.includes(model.id)">
                <Button
                  v-if="selectedModel !== model.id"
                  variant="outline"
                  size="sm"
                  class="border-[#2a2d33] bg-[#2a2d33]/50 text-gray-200 hover:text-white hover:bg-[#2a2d33] text-xs h-8 px-3"
                  :disabled="isDownloading"
                  @click="selectedModel = model.id"
                >
                  {{ $t("settings.transcription.modelSelect") }}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="border-[#2a2d33] bg-transparent text-gray-400 hover:text-red-400 hover:border-red-500/30 hover:bg-[#2a2d33] px-2 h-8"
                  :aria-label="$t('common.delete')"
                  :disabled="isDownloading"
                  @click="requestDeleteModel(model.id)"
                >
                  <Trash2 class="size-4" aria-hidden="true" />
                </Button>
              </template>
              <template v-else>
                <Button
                  variant="outline"
                  size="sm"
                  class="border-[#2a2d33] bg-[#1e2127] text-gray-300 hover:text-white hover:bg-[#2a2d33] text-xs h-8 px-3"
                  :disabled="isDownloading"
                  @click="downloadModel(model.id)"
                >
                  <Download class="size-3.5 mr-1.5" aria-hidden="true" />
                  {{ $t("settings.transcription.modelDownload") }}
                </Button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </TabsContent>

  <ConfirmDialog
    :open="showDeleteConfirm"
    :title="$t('confirm.deleteModel.title')"
    :description="$t('confirm.deleteModel.description')"
    :confirm-text="$t('confirm.deleteModel.confirm')"
    :cancel-text="$t('common.close')"
    variant="destructive"
    @update:open="showDeleteConfirm = $event"
    @confirm="confirmDeleteModel"
  />
</template>
