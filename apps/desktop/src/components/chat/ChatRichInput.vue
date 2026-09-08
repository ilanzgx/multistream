<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import EmotePicker from "./EmotePicker.vue";
import type { PickerEmote } from "@/composables/useRecentEmotes";
import { type EmoteData } from "@/composables/useEmotes";
import { calculateEmoteInsertion, generateHtmlFromText } from "@/lib/chatInput";

const props = defineProps<{
  modelValue: string;
  emotes: Map<string, EmoteData>;
  placeholder?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "submit"): void;
}>();

const editorRef = ref<HTMLElement | null>(null);
const selectionOffsets = ref({ start: 0, end: 0 });
const hasUserInteracted = ref(false);

function extractPlainText(node: Node): string {
  let text = "";
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += (child.textContent || "").replace(/\u00A0/g, " ");
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      if (el.tagName === "IMG" && el.dataset.emoteName) {
        text += el.dataset.emoteName;
      } else if (el.tagName === "BR") {
        text += "\n";
      } else if (el.tagName === "DIV" || el.tagName === "P") {
        text += "\n" + extractPlainText(child);
      } else {
        text += extractPlainText(child);
      }
    }
  }
  return text.replace(/\r?\n+/g, " ");
}

function getSelectionOffsetsWithin(element: HTMLElement) {
  let start = 0;
  let end = 0;
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);

    if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) {
      return { start, end };
    }

    const preStartRange = range.cloneRange();
    preStartRange.selectNodeContents(element);
    preStartRange.setEnd(range.startContainer, range.startOffset);
    start = extractPlainText(preStartRange.cloneContents()).length;

    const preEndRange = range.cloneRange();
    preEndRange.selectNodeContents(element);
    preEndRange.setEnd(range.endContainer, range.endOffset);
    end = extractPlainText(preEndRange.cloneContents()).length;
  }
  return { start, end };
}

function setCaretPosition(element: HTMLElement, offset: number) {
  const selection = window.getSelection();
  if (!selection) return;

  let currentOffset = 0;
  let found = false;

  function walk(node: Node) {
    if (found) return;

    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent || "").replace(/\u00A0/g, " ").length;
      if (currentOffset + len >= offset) {
        const range = document.createRange();
        range.setStart(node, offset - currentOffset);
        range.collapse(true);
        selection!.removeAllRanges();
        selection!.addRange(range);
        found = true;
      } else {
        currentOffset += len;
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName === "IMG" && el.dataset.emoteName) {
        const len = el.dataset.emoteName.length;
        if (currentOffset + len >= offset) {
          const range = document.createRange();
          if (offset === currentOffset) {
            range.setStartBefore(node);
          } else {
            range.setStartAfter(node);
          }
          range.collapse(true);
          selection!.removeAllRanges();
          selection!.addRange(range);
          found = true;
        } else {
          currentOffset += len;
        }
      } else if (el.tagName === "BR") {
        currentOffset += 1;
        if (currentOffset === offset) {
          const range = document.createRange();
          range.setStartAfter(node);
          range.collapse(true);
          selection!.removeAllRanges();
          selection!.addRange(range);
          found = true;
        }
      } else {
        for (const child of Array.from(node.childNodes)) {
          walk(child);
        }
      }
    }
  }

  walk(element);

  if (!found) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection!.removeAllRanges();
    selection!.addRange(range);
  }
}

function toHtml(text: string): string {
  return generateHtmlFromText(text, props.emotes);
}

function onInput() {
  if (!editorRef.value) return;
  const plainText = extractPlainText(editorRef.value);
  emit("update:modelValue", plainText);

  const expectedHtml = toHtml(plainText);
  if (editorRef.value.innerHTML !== expectedHtml) {
    const offsets = getSelectionOffsetsWithin(editorRef.value);
    editorRef.value.innerHTML = expectedHtml;
    setCaretPosition(editorRef.value, offsets.end);
    selectionOffsets.value = offsets;
  } else {
    selectionOffsets.value = getSelectionOffsetsWithin(editorRef.value);
  }
  hasUserInteracted.value = true;
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    emit("submit");
  }
}

function onPaste(e: ClipboardEvent) {
  e.preventDefault();
  const text = e.clipboardData?.getData("text/plain") || "";
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    onInput();
  }
}

function onCopy(e: ClipboardEvent) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const clonedSelection = range.cloneContents();
  const plainText = extractPlainText(clonedSelection);

  if (e.clipboardData) {
    e.clipboardData.setData("text/plain", plainText);
    e.preventDefault();
  }
}

function onCut(e: ClipboardEvent) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const clonedSelection = range.cloneContents();
  const plainText = extractPlainText(clonedSelection);

  if (e.clipboardData) {
    e.clipboardData.setData("text/plain", plainText);
    range.deleteContents();
    onInput();
    e.preventDefault();
  }
}

watch(
  () => props.modelValue,
  (newVal) => {
    if (!newVal) {
      selectionOffsets.value = { start: 0, end: 0 };
      hasUserInteracted.value = false;
    }
    if (editorRef.value && extractPlainText(editorRef.value) !== newVal) {
      editorRef.value.innerHTML = toHtml(newVal || "");
    }
  }
);

function handleSelectionChange() {
  if (!editorRef.value) return;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const isInside =
    editorRef.value.contains(sel.anchorNode) && editorRef.value.contains(sel.focusNode);

  if (!isInside) {
    const highlighted = editorRef.value.querySelectorAll("img.bg-blue-500\\/40");
    highlighted.forEach((img) => img.classList.remove("bg-blue-500/40"));
    return;
  }

  const images = editorRef.value.querySelectorAll("img[data-emote-name]");
  if (sel.isCollapsed) {
    images.forEach((img) => img.classList.remove("bg-blue-500/40"));
  } else {
    images.forEach((img) => {
      if (sel.containsNode(img, true)) {
        img.classList.add("bg-blue-500/40");
      } else {
        img.classList.remove("bg-blue-500/40");
      }
    });
  }

  selectionOffsets.value = getSelectionOffsetsWithin(editorRef.value);
  hasUserInteracted.value = true;
}

function handleEmoteSelect(emote: PickerEmote) {
  const currentText = props.modelValue || "";
  const { newText, newOffset } = calculateEmoteInsertion(
    currentText,
    selectionOffsets.value,
    emote.name,
    hasUserInteracted.value
  );

  emit("update:modelValue", newText);

  if (editorRef.value) {
    editorRef.value.innerHTML = toHtml(newText);
    selectionOffsets.value = { start: newOffset, end: newOffset };
    hasUserInteracted.value = true;

    setTimeout(() => {
      if (!editorRef.value) return;
      editorRef.value.focus();
      setCaretPosition(editorRef.value, newOffset);
    }, 0);
  }
}

onMounted(() => {
  if (props.modelValue && editorRef.value) {
    editorRef.value.innerHTML = toHtml(props.modelValue);
  }
  document.addEventListener("selectionchange", handleSelectionChange);
});

onUnmounted(() => {
  document.removeEventListener("selectionchange", handleSelectionChange);
});
</script>

<script lang="ts">
export default {
  inheritAttrs: false,
};
</script>

<template>
  <div class="relative flex items-center w-full min-w-0">
    <div
      v-if="!modelValue && placeholder"
      class="absolute left-[13px] top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none select-none"
    >
      {{ placeholder }}
    </div>

    <div
      ref="editorRef"
      contenteditable="true"
      class="flex-1 w-full min-w-0 rounded-md border border-[#2a2d33] bg-[#1a1d24] pl-3 pr-10 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 disabled:opacity-50 break-words min-h-[38px] max-h-[120px] overflow-y-auto whitespace-pre-wrap"
      :class="[{ 'opacity-50 pointer-events-none': disabled }, $attrs.class]"
      role="textbox"
      aria-multiline="true"
      @input="onInput"
      @keydown="onKeyDown"
      @keyup="handleSelectionChange"
      @pointerup="handleSelectionChange"
      @paste="onPaste"
      @copy="onCopy"
      @cut="onCut"
    ></div>

    <div class="absolute right-1 top-1/2 -translate-y-1/2">
      <EmotePicker :emotes="emotes" @select="handleEmoteSelect" />
    </div>
  </div>
</template>
