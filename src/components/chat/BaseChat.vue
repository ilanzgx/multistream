<template>
  <div class="chat-container">
    <slot />
  </div>
</template>

<style scoped>
.chat-container {
  width: 100%;
  height: 100%;
}

:slotted(iframe) {
  width: 100%;
  height: 80vh;
}
</style>
