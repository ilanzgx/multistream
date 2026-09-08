export interface EmoteInsertionResult {
  newText: string;
  newOffset: number;
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function calculateEmoteInsertion(
  currentText: string,
  offsets: { start: number; end: number },
  emoteName: string,
  hasUserInteracted: boolean
): EmoteInsertionResult {
  let start = Math.max(0, Math.min(offsets.start, currentText.length));
  let end = Math.max(0, Math.min(offsets.end, currentText.length));

  if (!hasUserInteracted && currentText.length > 0) {
    start = currentText.length;
    end = currentText.length;
  }

  if (start > end) [start, end] = [end, start];

  let insertText = emoteName;

  if (start > 0 && currentText[start - 1] !== " ") {
    insertText = " " + insertText;
  }

  if (end < currentText.length && currentText[end] !== " ") {
    insertText = insertText + " ";
  } else if (end === currentText.length) {
    insertText = insertText + " ";
  }

  const newText = currentText.slice(0, start) + insertText + currentText.slice(end);
  const newOffset = start + insertText.length;

  return { newText, newOffset };
}

export function generateHtmlFromText(text: string, emotes: Map<string, { url: string }>): string {
  const words = text.split(/(\s+)/);
  let html = "";
  for (const word of words) {
    const url = word.trim() ? emotes.get(word)?.url : undefined;
    if (url) {
      html += `<img src="${escapeAttr(url)}" data-emote-name="${escapeAttr(word)}" alt="${escapeAttr(word)}" class="inline-block h-[1.5em] align-middle mx-[2px]" contenteditable="false">`;
    } else {
      html += escapeAttr(word).replace(/\n/g, "<br>");
    }
  }
  return html;
}
