import { ref, type VNode, type Component } from "vue";

export type ToastType = "success" | "error" | "warning" | "info" | "default" | "custom";
export type ToastPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  id?: string | number;
  duration?: number;
  description?: string | VNode | Component;
  action?: ToastAction;
  position?: ToastPosition;
  unstyled?: boolean;
  style?: Record<string, string>;
  class?: string | Record<string, any> | any[];
}

export interface Toast {
  id: string | number;
  type: ToastType;
  message?: string;
  component?: VNode | Component;
  options?: ToastOptions;
  position: ToastPosition;
  timer?: ReturnType<typeof setTimeout>;
}

const activeToasts = ref<Toast[]>([]);

let toastIdCounter = 0;

function generateId() {
  return `__sys_toast_${++toastIdCounter}`;
}

function removeToast(id: string | number) {
  const index = activeToasts.value.findIndex((t) => t.id === id);
  if (index !== -1) {
    const t = activeToasts.value[index];
    if (t && t.timer) clearTimeout(t.timer);
    activeToasts.value.splice(index, 1);
  }
}

function addToast(
  type: ToastType,
  messageOrComponent: string | VNode | Component,
  options?: ToastOptions
) {
  const id = options?.id || generateId();
  const position = options?.position || "bottom-left";

  const existingIndex = activeToasts.value.findIndex((t) => t.id === id);

  const toastItem: Toast = {
    id,
    type,
    options,
    position,
  };

  if (typeof messageOrComponent === "string") {
    toastItem.message = messageOrComponent;
  } else {
    toastItem.component = messageOrComponent;
  }

  const duration = options?.duration ?? 4000;
  if (duration !== Infinity) {
    toastItem.timer = setTimeout(() => {
      removeToast(id);
    }, duration);
  }

  if (existingIndex !== -1) {
    const existing = activeToasts.value[existingIndex];

    if (existing && existing.timer) {
      clearTimeout(existing.timer);
    }

    // Create a new reference to trigger reactivity deeply if needed, though index assignment works
    activeToasts.value[existingIndex] = toastItem;
  } else {
    activeToasts.value.push(toastItem);

    const MAX_TOASTS = 5;
    const toastsInPosition = activeToasts.value.filter((t) => t.position === position);
    if (toastsInPosition.length > MAX_TOASTS) {
      const oldestToast = toastsInPosition[0];
      if (oldestToast && oldestToast.timer) {
        clearTimeout(oldestToast.timer);
      }
      const indexToRemove = activeToasts.value.findIndex((t) => t.id === oldestToast?.id);
      if (indexToRemove !== -1) {
        activeToasts.value.splice(indexToRemove, 1);
      }
    }
  }

  return id;
}

export const toast = Object.assign(
  (messageOrComponent: string | VNode | Component, options?: ToastOptions) =>
    addToast("default", messageOrComponent, options),
  {
    success: (message: string, options?: ToastOptions) => addToast("success", message, options),
    error: (message: string, options?: ToastOptions) => addToast("error", message, options),
    warning: (message: string, options?: ToastOptions) => addToast("warning", message, options),
    info: (message: string, options?: ToastOptions) => addToast("info", message, options),
    loading: (message: string, options?: ToastOptions) => addToast("info", message, options),
    custom: (component: VNode | Component, options?: ToastOptions) =>
      addToast("custom", component, options),
    dismiss: (id: string | number) => removeToast(id),
  }
);

export function useToast() {
  return {
    toasts: activeToasts,
    dismiss: removeToast,
  };
}

export function __test_resetToastState() {
  for (const t of activeToasts.value) {
    if (t.timer) clearTimeout(t.timer);
  }
  activeToasts.value = [];
}
