<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { SwitchRoot, SwitchThumb } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<{ class?: HTMLAttributes["class"]; disabled?: boolean }>();
const checked = defineModel<boolean>("checked");
const modelValue = defineModel<boolean>();

// Sync them in case reka-ui uses modelValue
const isChecked = () => {
  if (checked.value !== undefined) return checked.value;
  if (modelValue.value !== undefined) return modelValue.value;
  return false;
};

const updateChecked = (v: boolean) => {
  if (checked.value !== undefined) checked.value = v;
  if (modelValue.value !== undefined) modelValue.value = v;
};
</script>

<template>
  <SwitchRoot
    data-slot="switch"
    :model-value="isChecked()"
    :disabled="props.disabled"
    :class="
      cn(
        'inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-[#3a3f4b] shadow-sm transition-all duration-200 outline-none cursor-pointer',
        'data-[state=checked]:bg-green-600 data-[state=checked]:border-green-500/50',
        'data-[state=unchecked]:bg-[#2a2d33] data-[state=unchecked]:border-[#3a3f4b]',
        'focus-visible:ring-2 focus-visible:ring-green-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-[#191b1f]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        props.class
      )
    "
    @update:model-value="updateChecked"
  >
    <SwitchThumb
      data-slot="switch-thumb"
      :class="
        cn(
          'pointer-events-none block size-4 rounded-full shadow-md ring-0 transition-transform duration-200',
          'bg-white',
          'data-[state=checked]:translate-x-6',
          'data-[state=unchecked]:translate-x-1'
        )
      "
    >
      <slot name="thumb" />
    </SwitchThumb>
  </SwitchRoot>
</template>
