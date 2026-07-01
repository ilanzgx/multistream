<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import EmotePicker from "./EmotePicker.vue";
import type { PickerEmote } from "@/composables/useRecentEmotes";
import { type EmoteData } from "@/composables/useEmotes";

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
  return text.replace(/\n/g, ""); // Twitch chat doesn't support multiline, and stripping newlines fixes the trailing <br> issue
}

function getSelectionOffsetsWithin(element: HTMLElement) {
  let start = 0;
  let end = 0;
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);

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

function generateHtmlFromText(text: string): string {
  const words = text.split(/(\s+)/);
  let html = "";
  for (const word of words) {
    if (word.trim() && props.emotes.has(word)) {
      const url = props.emotes.get(word)?.url;
      if (url) {
        html += `<img src="${url}" data-emote-name="${word}" alt="${word}" class="inline-block h-[1.5em] align-middle mx-[2px]" contenteditable="false">`;
      }
    } else {
      html += word
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
    }
  }
  return html;
}

function onInput() {
  if (!editorRef.value) return;
  const plainText = extractPlainText(editorRef.value);
  emit("update:modelValue", plainText);

  const expectedHtml = generateHtmlFromText(plainText);
  if (editorRef.value.innerHTML !== expectedHtml) {
    const offsets = getSelectionOffsetsWithin(editorRef.value);
    editorRef.value.innerHTML = expectedHtml;
    setCaretPosition(editorRef.value, offsets.end);
  }
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
    if (editorRef.value && extractPlainText(editorRef.value) !== newVal) {
      editorRef.value.innerHTML = generateHtmlFromText(newVal || "");
    }
  }
);

function handleSelectionChange() {
  if (!editorRef.value) return;
  const sel = window.getSelection();
  const images = editorRef.value.querySelectorAll("img[data-emote-name]");

  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
    images.forEach((img) => img.classList.remove("bg-blue-500/40"));
    return;
  }

  images.forEach((img) => {
    if (sel.containsNode(img, true)) {
      img.classList.add("bg-blue-500/40");
    } else {
      img.classList.remove("bg-blue-500/40");
    }
  });

  // Track caret offset when editor is focused
  if (editorRef.value && editorRef.value.contains(sel.anchorNode)) {
    selectionOffsets.value = getSelectionOffsetsWithin(editorRef.value);
  }
}

function handleEmoteSelect(emote: PickerEmote) {
  const currentText = props.modelValue || "";

  // Need spaces around the emote unless it's at start/end
  let insertText = emote.name;

  // Add space before if needed
  if (selectionOffsets.value.start > 0 && currentText[selectionOffsets.value.start - 1] !== " ") {
    insertText = " " + insertText;
  }

  // Add space after if needed
  if (
    selectionOffsets.value.end < currentText.length &&
    currentText[selectionOffsets.value.end] !== " "
  ) {
    insertText = insertText + " ";
  } else if (selectionOffsets.value.end === currentText.length) {
    insertText = insertText + " "; // always add a space at the end to make it easier to continue typing
  }

  const newText =
    currentText.slice(0, selectionOffsets.value.start) +
    insertText +
    currentText.slice(selectionOffsets.value.end);

  emit("update:modelValue", newText);

  if (editorRef.value) {
    editorRef.value.innerHTML = generateHtmlFromText(newText);
    const newOffset = selectionOffsets.value.start + insertText.length;
    selectionOffsets.value = { start: newOffset, end: newOffset };

    // Focus back and set caret
    setTimeout(() => {
      editorRef.value?.focus();
      setCaretPosition(editorRef.value!, newOffset);
    }, 0);
  }
}

onMounted(() => {
  if (props.modelValue && editorRef.value) {
    editorRef.value.innerHTML = generateHtmlFromText(props.modelValue);
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
    <!-- Placeholder -->
    <div
      v-if="!modelValue && placeholder"
      class="absolute left-[13px] top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none select-none"
    >
      {{ placeholder }}
    </div>

    <!-- Editor -->
    <div
      ref="editorRef"
      contenteditable="true"
      class="flex-1 w-full min-w-0 rounded-md border border-[#2a2d33] bg-[#1a1d24] pl-3 pr-10 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 disabled:opacity-50 break-words min-h-[38px] max-h-[120px] overflow-y-auto whitespace-pre-wrap"
      :class="[{ 'opacity-50 pointer-events-none': disabled }, $attrs.class]"
      role="textbox"
      aria-multiline="true"
      @input="onInput"
      @keydown="onKeyDown"
      @paste="onPaste"
      @copy="onCopy"
      @cut="onCut"
    ></div>

    <div class="absolute right-1 top-1/2 -translate-y-1/2">
      <EmotePicker :emotes="emotes" @select="handleEmoteSelect" />
    </div>
  </div>
</template>

<style scoped>
/* Remove focus outline to rely on custom rings */
div[contenteditable]:empty:before {
  content: attr(placeholder);
  color: #6b7280;
  pointer-events: none;
  display: block; /* For Firefox */
}
</style>
