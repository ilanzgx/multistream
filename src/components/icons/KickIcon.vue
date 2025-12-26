<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 32 32"
    fill="currentColor"
    :width="size"
    :height="size"
    v-bind="$attrs"
  >
    <path
      d="M23,0H9C4,0,0,4,0,9v14c0,5,4,9,9,9h14c5,0,9-4,9-9V9C32,4,28,0,23,0z M24.2,20.1c0.9,1.1,1,2.6,0.4,3.8c-0.6,1.3-2,2.1-3.5,2.1c-1.2,0-2.3-0.5-3-1.5L15,20.8V22c0,2.1-1.9,4-4.1,4C8.8,26,7,24.3,7,22.2V9.8C7,7.7,8.8,6,10.9,6c2.2,0,4.1,1.9,4.1,4v1.9l3.1-4.4C18.8,6.5,20,6,21.2,6c1.5,0,2.8,0.8,3.5,2.1c0.6,1.3,0.4,2.7-0.4,3.8L21,16L24.2,20.1z"
    />
  </svg>
</template>

<script setup lang="ts">
interface Props {
  size?: number | string;
}

withDefaults(defineProps<Props>(), {
  size: 24,
});
</script>
