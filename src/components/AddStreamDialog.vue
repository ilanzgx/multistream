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
import { Button } from "@/components/ui/button";

// father props
defineProps<{
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();
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
        <label class="text-sm font-medium">Channel Name</label>
        <input
          type="text"
          placeholder="Enter channel name..."
          class="w-full px-3 py-2 border rounded-md bg-background"
        />
      </div>

      <DialogFooter>
        <DialogClose as-child>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button class="cursor-pointer">Add Stream</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
