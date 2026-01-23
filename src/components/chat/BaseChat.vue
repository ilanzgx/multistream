<template>
  <div class="chat-container">
    <slot />
  </div>
</template>

<style scoped>
.chat-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

:slotted(iframe) {
  width: 100%;
  height: 100%;
  flex: 1;
  min-height: 0;
  border: none;
}
</style>
