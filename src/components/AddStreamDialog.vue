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
import { Button } from "@/components/ui/button";
import { useStreams, type Platform } from "@/composables/useStreams";

// props
defineProps<{
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const { addStream } = useStreams();

// local state
const channelName = ref("");
const selectedPlatform = ref<Platform>("kick");

const handleAddStream = () => {
  if (!channelName.value.trim()) {
    return;
  }

  addStream(channelName.value.trim(), selectedPlatform.value);

  channelName.value = "";
  selectedPlatform.value = "kick";
  emit("update:open", false);
};
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add New Stream</DialogTitle>
        <DialogDescription>
          Enter the channel name to add a new stream to your multistream.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <!-- platform selector -->
        <div class="space-y-2">
          <label class="text-sm font-medium">Platform</label>
          <select
            v-model="selectedPlatform"
            class="w-full px-3 py-2 border rounded-md bg-background cursor-pointer"
          >
            <option value="kick">Kick</option>
            <option value="twitch">Twitch</option>
            <option value="youtube">Youtube</option>
          </select>
        </div>

        <!-- channel name -->
        <div class="space-y-2">
          <label class="text-sm font-medium">Channel Name</label>
          <input
            v-model="channelName"
            type="text"
            placeholder="Enter channel name..."
            class="w-full px-3 py-2 border rounded-md bg-background"
            @keyup.enter="handleAddStream"
          />
        </div>
      </div>

      <DialogFooter>
        <DialogClose as-child>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button
          class="cursor-pointer"
          @click="handleAddStream"
          :disabled="!channelName.trim()"
        >
          Add Stream
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
