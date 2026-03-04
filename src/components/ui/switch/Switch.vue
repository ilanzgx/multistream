<script setup lang="ts">
import type { SwitchRootEmits, SwitchRootProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { SwitchRoot, SwitchThumb, useForwardPropsEmits } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<
  SwitchRootProps & { class?: HTMLAttributes["class"] }
>();

const emits = defineEmits<SwitchRootEmits>();

const delegatedProps = reactiveOmit(props, "class");

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <SwitchRoot
    v-slot="slotProps"
    data-slot="switch"
    v-bind="forwarded"
    :class="
      cn(
        'inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-[#3a3f4b] shadow-sm transition-all duration-200 outline-none cursor-pointer',
        'data-[state=checked]:bg-green-600 data-[state=checked]:border-green-500/50',
        'data-[state=unchecked]:bg-[#2a2d33] data-[state=unchecked]:border-[#3a3f4b]',
        'focus-visible:ring-2 focus-visible:ring-green-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-[#191b1f]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )
    "
  >
    <SwitchThumb
      data-slot="switch-thumb"
      :class="
        cn(
          'pointer-events-none block size-4 rounded-full shadow-md ring-0 transition-transform duration-200',
          'bg-white',
          'data-[state=checked]:translate-x-6',
          'data-[state=unchecked]:translate-x-1',
        )
      "
    >
      <slot name="thumb" v-bind="slotProps" />
    </SwitchThumb>
  </SwitchRoot>
</template>
