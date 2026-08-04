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
      d="M26.711 14.929l-4.284 4.284h-4.285l-3.749 3.749v-3.749h-4.82v-16.067h17.138zM8.502 1.004l-5.356 5.356v19.279h6.427v5.356l5.356-5.356h4.284l9.641-9.64v-14.996zM21.356 6.895h2.142v6.427h-2.142zM15.464 6.895h2.143v6.427h-2.144z"
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
