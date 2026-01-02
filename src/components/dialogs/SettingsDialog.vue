<script setup lang="ts">
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
import { useUpdater } from "@/composables/useUpdater";
import { RefreshCw } from "lucide-vue-next";

const { checkForUpdates, isChecking } = useUpdater();

defineProps<{
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const handleCheckUpdates = () => {
  checkForUpdates(true);
};
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="bg-[#191b1f] border-[#2a2d33]">
      <DialogHeader>
        <DialogTitle class="text-white">Settings</DialogTitle>
        <DialogDescription class="text-gray-400">
          Adjust your preferences.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-white text-sm font-medium">Updates</p>
            <p class="text-gray-400 text-xs">Check for new versions</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            class="border-[#2a2d33] bg-[#14161a] text-white hover:text-gray-300 hover:bg-[#1c1f24] hover:border-[#3a3f4b] transition-colors"
            :disabled="isChecking"
            @click="handleCheckUpdates"
          >
            <RefreshCw
              class="size-4 mr-2"
              :class="{ 'animate-spin': isChecking }"
            />
            {{ isChecking ? "Checking..." : "Check for Updates" }}
          </Button>
        </div>
      </div>

      <DialogFooter>
        <DialogClose as-child>
          <Button
            variant="outline"
            class="border-[#2a2d33] bg-[#14161a] text-white hover:text-gray-300 hover:bg-[#1c1f24] hover:border-[#3a3f4b] transition-colors"
          >
            Close
          </Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
