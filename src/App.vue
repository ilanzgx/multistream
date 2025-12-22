<script setup lang="ts">
import { ref, computed } from "vue";
import { Button } from "./components/ui/button";
import KickChat from "./components/KickChat.vue";
import KickStream from "./components/KickStream.vue";
import { UserPlus2, Settings2, Share2, LogOutIcon } from "lucide-vue-next";

const sidebarOpen = ref(true);

const streams = ref([
  "exort_en",
  "exort_en",
  "exort_en",
  "exort_en",
  "exort_en",
]);

const gridClass = computed(() => {
  const count = streams.value.length;

  if (count === 1) return "grid-cols-1 grid-rows-1";
  if (count === 2) return "grid-cols-1 grid-rows-2";
  if (count === 3) return "grid-cols-2 grid-rows-2";
  if (count === 4) return "grid-cols-2 grid-rows-2";
  if (count <= 6) return "grid-cols-3 grid-rows-2";
  if (count <= 9) return "grid-cols-3 grid-rows-3";

  return "grid-cols-4 grid-rows-3";
});
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-background">
    <!-- main -->
    <main class="flex-1 overflow-hidden">
      <div class="h-full grid" :class="gridClass">
        <KickStream
          v-for="(channel, index) in streams"
          :key="channel"
          :channel="channel"
          :class="{
            'col-span-2 justify-self-center w-1/2':
              streams.length === 3 && index === 2,
          }"
        />
      </div>
    </main>

    <!-- sidebar -->
    <aside
      class="w-80 border-l bg-card shadow-lg overflow-y-auto transition-all duration-300"
      :class="{ 'translate-x-full': !sidebarOpen }"
    >
      <div class="space-y-4">
        <KickChat channel="exort_en" />

        <div class="flex justify-center items-center gap-4">
          <Button variant="outline">
            <UserPlus2 class="size-6" />
          </Button>

          <Button variant="outline">
            <Settings2 class="size-6" />
          </Button>

          <Button variant="outline">
            <Share2 class="size-6" />
          </Button>

          <Button variant="outline" @click="sidebarOpen = !sidebarOpen">
            <LogOutIcon class="size-6" />
          </Button>
        </div>
      </div>
    </aside>

    <!-- toggle button -->
    <button
      v-if="!sidebarOpen"
      @click="sidebarOpen = true"
      class="fixed right-0 top-1/2 -translate-y-1/2 bg-card border border-r-0 rounded-l-lg px-2 py-8 shadow-lg hover:bg-accent transition-colors"
    >
      ☰
    </button>
  </div>
</template>
