<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { isTauri } from "@/composables/useUpdater";
import { APP_LINKS } from "@/config/links";
import { parseReleaseNotes, type ParsedChangelog } from "@/lib/changelogParser";
import { ExternalLink, RefreshCw, AlertCircle } from "@lucide/vue";

interface GithubReleaseResponse {
  tag_name?: string;
  published_at?: string;
  html_url?: string;
  body?: string;
}

type ChangelogState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "success";
      version: string;
      publishedAt: string | null;
      htmlUrl: string;
      parsed: ParsedChangelog;
    }
  | { status: "error" };

const props = withDefaults(
  defineProps<{
    open?: boolean;
  }>(),
  {
    open: false,
  }
);

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const { locale } = useI18n();
const isRunningInTauri = isTauri();
const appVersion = import.meta.env.VITE_APP_VERSION || "0.18.17";
const state = ref<ChangelogState>({ status: "idle" });

const displayVersion = computed(() => {
  if (state.value.status === "success") {
    return state.value.version;
  }
  return `v${appVersion.replace(/^v/, "")}`;
});

const formattedDate = computed(() => {
  if (state.value.status !== "success" || !state.value.publishedAt) {
    return null;
  }
  try {
    return new Date(state.value.publishedAt).toLocaleDateString(locale.value, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return null;
  }
});

const releaseUrl = computed(() => {
  if (state.value.status === "success" && state.value.htmlUrl) {
    return state.value.htmlUrl;
  }
  const cleanVer = appVersion.replace(/^v/, "");
  return `${APP_LINKS.github.releases}/tag/v${cleanVer}`;
});

async function openExternalLink(url: string) {
  if (isRunningInTauri) {
    try {
      const { open: openUrl } = await import("@tauri-apps/plugin-shell");
      await openUrl(url);
      return;
    } catch (e) {
      console.error("Failed to open URL via Tauri plugin-shell:", e);
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

async function fetchChangelog() {
  state.value = { status: "loading" };
  const cleanVer = appVersion.replace(/^v/, "");
  const tagUrl = `https://api.github.com/repos/ilanzgx/multistream/releases/tags/v${cleanVer}`;
  const latestUrl = "https://api.github.com/repos/ilanzgx/multistream/releases/latest";

  try {
    let response = await fetch(tagUrl, {
      headers: { Accept: "application/vnd.github+json" },
    });

    if (response.status === 404) {
      response = await fetch(latestUrl, {
        headers: { Accept: "application/vnd.github+json" },
      });
    }

    if (!response.ok) {
      state.value = { status: "error" };
      return;
    }

    const data = (await response.json()) as GithubReleaseResponse;
    const rawTag = data.tag_name || `v${cleanVer}`;
    const normalizedTag = rawTag.startsWith("v") ? rawTag : `v${rawTag}`;

    state.value = {
      status: "success",
      version: normalizedTag,
      publishedAt: data.published_at ?? null,
      htmlUrl: data.html_url || `${APP_LINKS.github.releases}/tag/${normalizedTag}`,
      parsed: parseReleaseNotes(data.body ?? ""),
    };
  } catch {
    state.value = { status: "error" };
  }
}

function handleClose() {
  emit("update:open", false);
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && state.value.status !== "success" && state.value.status !== "loading") {
      fetchChangelog();
    }
  },
  { immediate: true }
);
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent
      data-testid="changelog-dialog"
      class="bg-[#14161a] border-[#2a2d33] sm:max-w-2xl md:max-w-3xl flex flex-col max-h-[85vh] p-6 outline-none"
      @open-auto-focus.prevent
    >
      <DialogHeader class="space-y-1 text-left pr-6">
        <div class="flex items-center gap-2.5 flex-wrap">
          <DialogTitle class="text-white text-base sm:text-lg font-semibold tracking-tight">
            {{ $t("changelog.title") }}
          </DialogTitle>
          <span
            data-testid="changelog-version-badge"
            class="px-2 py-0.5 text-xs font-mono font-medium bg-[#1e2127] text-gray-200 border border-[#2a2d33] rounded-md tabular-nums"
          >
            {{ displayVersion }}
          </span>
          <span v-if="formattedDate" class="text-xs text-gray-400 tabular-nums">
            · {{ formattedDate }}
          </span>
        </div>
        <DialogDescription class="text-gray-400 text-xs leading-relaxed">
          {{ $t("changelog.description") }}
        </DialogDescription>
      </DialogHeader>

      <!-- Scrollable Release Notes Content -->
      <div
        class="flex-1 min-h-[200px] max-h-[52vh] overflow-y-auto overflow-x-hidden mt-3 pr-1.5 scrollbar-thin"
        data-testid="changelog-body"
      >
        <!-- Loading State -->
        <div
          v-if="state.status === 'loading' || state.status === 'idle'"
          data-testid="changelog-loading"
          class="space-y-4 py-2"
        >
          <span class="sr-only">{{ $t("changelog.loading") }}</span>
          <div v-for="group in 2" :key="group" class="space-y-2.5">
            <div class="h-4 w-28 bg-[#1e2127] rounded animate-pulse" />
            <div class="space-y-2 pl-3">
              <div class="h-3.5 w-full bg-[#1e2127]/80 rounded animate-pulse" />
              <div class="h-3.5 w-5/6 bg-[#1e2127]/80 rounded animate-pulse" />
              <div class="h-3.5 w-4/6 bg-[#1e2127]/80 rounded animate-pulse" />
            </div>
          </div>
        </div>

        <!-- Error State -->
        <div
          v-else-if="state.status === 'error'"
          data-testid="changelog-error"
          class="flex flex-col items-center justify-center text-center py-8 px-4 space-y-3"
        >
          <div
            class="size-10 rounded-full bg-[#1e2127] border border-[#2a2d33] flex items-center justify-center text-gray-400"
            aria-hidden="true"
          >
            <AlertCircle class="size-5" />
          </div>
          <div class="space-y-1 max-w-sm">
            <p class="text-sm font-medium text-white">
              {{ $t("changelog.errorTitle") }}
            </p>
            <p class="text-xs text-gray-400 leading-relaxed">
              {{ $t("changelog.errorDescription") }}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            data-testid="changelog-retry-btn"
            class="mt-1 border-[#2a2d33] bg-[#1e2127] text-gray-300 hover:text-white hover:bg-[#2a2d33] transition-colors cursor-pointer"
            @click="fetchChangelog"
          >
            <RefreshCw class="size-3.5 mr-1.5" aria-hidden="true" />
            {{ $t("changelog.retry") }}
          </Button>
        </div>

        <!-- Success: Maintenance Release -->
        <div
          v-else-if="state.parsed.isMaintenance"
          data-testid="changelog-maintenance"
          class="py-6 px-4 rounded-xl bg-[#181a1f] border border-[#2a2d33]/80 text-xs sm:text-sm text-gray-300 leading-relaxed"
        >
          {{ $t("changelog.maintenance") }}
        </div>

        <!-- Success: Categorized Sections -->
        <div v-else class="space-y-5 py-1" data-testid="changelog-sections">
          <section
            v-for="(section, sIdx) in state.parsed.sections"
            :key="sIdx"
            class="space-y-2.5 first:pt-0 pt-3 first:border-t-0 border-t border-[#2a2d33]/50"
          >
            <h3
              v-if="section.title"
              class="text-xs sm:text-sm font-semibold text-white tracking-tight"
            >
              {{ section.title }}
            </h3>
            <ul class="space-y-2">
              <li
                v-for="(segments, iIdx) in section.items"
                :key="iIdx"
                class="flex items-start gap-2.5 text-xs sm:text-sm text-gray-300 leading-relaxed"
              >
                <span class="mt-2 size-1.5 rounded-full bg-gray-500 shrink-0" aria-hidden="true" />
                <div class="min-w-0 flex-1 break-words">
                  <template v-for="(seg, segIdx) in segments" :key="segIdx">
                    <strong v-if="seg.type === 'bold'" class="font-semibold text-white">{{
                      seg.content
                    }}</strong>
                    <code
                      v-else-if="seg.type === 'code'"
                      class="px-1.5 py-0.5 rounded bg-[#1f2227] border border-[#2a2d33] text-gray-200 font-mono text-xs"
                      >{{ seg.content }}</code
                    >
                    <button
                      v-else-if="seg.type === 'link'"
                      type="button"
                      class="inline font-mono text-xs text-gray-200 underline decoration-white/30 underline-offset-2 hover:text-white hover:decoration-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-xs"
                      @click="openExternalLink(seg.url)"
                    >
                      {{ seg.text }}
                    </button>
                    <span v-else>{{ seg.content }}</span>
                  </template>
                </div>
              </li>
            </ul>
          </section>
        </div>
      </div>

      <!-- Footer -->
      <DialogFooter
        class="pt-4 mt-2 border-t border-[#2a2d33]/50 flex flex-row items-center justify-between sm:justify-between gap-3"
      >
        <button
          type="button"
          data-testid="changelog-github-link"
          class="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded px-1 py-1 min-h-[32px]"
          @click="openExternalLink(releaseUrl)"
        >
          <ExternalLink class="size-3.5 shrink-0" aria-hidden="true" />
          <span>{{ $t("changelog.viewOnGithub") }}</span>
        </button>

        <Button
          type="button"
          data-testid="changelog-close-btn"
          class="bg-white text-black hover:bg-gray-200 font-medium text-xs px-4 min-h-[32px] cursor-pointer transition-colors"
          @click="handleClose"
        >
          {{ $t("changelog.gotIt") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
