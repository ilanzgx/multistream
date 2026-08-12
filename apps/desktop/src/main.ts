import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import { i18n } from "./i18n";
import { invoke } from "@tauri-apps/api/core";

createApp(App).use(i18n).mount("#app");

// Ensure splash screen is dismissed regardless of component mount delays.
// A brief timeout guarantees the DOM is fully painted in the main window.
setTimeout(() => {
  invoke("close_splashscreen").catch(() => {
    // ignore
  });
}, 250);
