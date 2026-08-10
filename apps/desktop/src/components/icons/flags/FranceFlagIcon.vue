<script setup lang="ts">
defineProps<{
  size?: string | number;
}>();
</script>

<template>
  <svg
    :width="size || 24"
    :height="size || 24"
    xmlns="http://www.w3.org/2000/svg"
    shape-rendering="geometricPrecision"
    text-rendering="geometricPrecision"
    image-rendering="optimizeQuality"
    fill-rule="evenodd"
    clip-rule="evenodd"
    viewBox="0 0 512 356.18"
  >
    <path
      fill="#E1000F"
      d="M345.04 0h139C499.44.1 512 12.72 512 28.13v299.91c0 15.47-12.65 28.13-28.13 28.14H345.04V0zM15.11 352.95zm-9.54-8.15z"
    />
    <path
      fill="#fff"
      d="M27.96 0h317.08v356.18H27.98C12.57 356.09 0 343.46 0 328.04V28.14C0 12.72 12.56.1 27.96 0z"
    />
    <path
      fill="#273375"
      d="M27.96 0h138.99v356.18H28c-15.42-.08-28-12.71-28-28.14V28.14C0 12.72 12.56.1 27.96 0z"
    />
  </svg>
</template>
