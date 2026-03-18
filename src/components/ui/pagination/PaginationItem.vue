<script setup lang="ts">
import type { PaginationListItemProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { PaginationListItem } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<
  PaginationListItemProps & {
    class?: HTMLAttributes["class"];
  }
>();

const delegatedProps = reactiveOmit(props, "class");
</script>

<template>
  <PaginationListItem
    data-slot="pagination-item"
    v-bind="delegatedProps"
    :class="cn(props.class)"
  >
    <slot />
  </PaginationListItem>
</template>
