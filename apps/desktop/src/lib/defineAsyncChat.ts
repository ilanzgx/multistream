import { defineAsyncComponent, type Component } from "vue";
import ChatLoadState from "@/components/chat/ChatLoadState.vue";

export function defineAsyncChat(loader: () => Promise<Component>) {
  return defineAsyncComponent({
    loader,
    loadingComponent: ChatLoadState,
    errorComponent: ChatLoadState,
    delay: 200,
    timeout: 15_000,
    onError(_error, retry, fail, attempts) {
      if (attempts <= 2) {
        setTimeout(retry, attempts * 500);
      } else {
        fail();
      }
    },
  });
}
