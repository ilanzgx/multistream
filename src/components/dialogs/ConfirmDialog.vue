<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Button from "@/components/ui/button/Button.vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "default" | "destructive";
  }>(),
  {
    confirmText: "Confirm",
    cancelText: "Cancel",
    variant: "default",
  }
);

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "confirm"): void;
  (e: "cancel"): void;
}>();

const handleConfirm = () => {
  emit("confirm");
  emit("update:open", false);
};

const handleCancel = () => {
  emit("cancel");
  emit("update:open", false);
};
</script>

<template>
  <Dialog :open="open" :modal="false" @update:open="emit('update:open', $event)">
    <DialogContent class="bg-[#14161a] border-[#2a2d33] max-w-md">
      <DialogHeader>
        <DialogTitle class="text-white">
          {{ title }}
        </DialogTitle>
        <DialogDescription class="text-gray-400">
          {{ description }}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter class="pt-4 border-t border-[#2a2d33]/50 flex gap-2 justify-end">
        <Button
          variant="outline"
          class="border-[#2a2d33] bg-transparent text-gray-400 hover:text-white hover:bg-white/5 hover:border-[#3a3f4b] transition-all duration-200"
          @click="handleCancel"
        >
          {{ cancelText }}
        </Button>
        <Button
          :class="
            variant === 'destructive'
              ? 'bg-red-600 hover:bg-red-700 text-white border-transparent transition-all duration-200 active:scale-[0.97]'
              : 'bg-[#ea580c] hover:bg-[#c2410c] text-white border-transparent transition-all duration-200 active:scale-[0.97]'
          "
          @click="handleConfirm"
        >
          {{ confirmText }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
