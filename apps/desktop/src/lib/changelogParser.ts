export type InlineSegment =
  | { type: "text"; content: string }
  | { type: "bold"; content: string }
  | { type: "code"; content: string }
  | { type: "link"; text: string; url: string };

export interface ChangelogSection {
  title: string;
  paragraphs?: InlineSegment[][];
  items: InlineSegment[][];
  notes?: InlineSegment[][];
}

export interface ParsedChangelog {
  sections: ChangelogSection[];
  isMaintenance: boolean;
}

const DOWNLOADS_CUTOFF_REGEX =
  /^(?:##\s+Downloads|###\s+macOS\s*\(Homebrew\)|###\s+Browser Extension Setup)\b/im;

const INLINE_TOKEN_REGEX = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;

export function parseInlineSegments(line: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let lastIndex = 0;

  for (const match of line.matchAll(INLINE_TOKEN_REGEX)) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      segments.push({
        type: "text",
        content: line.slice(lastIndex, matchIndex),
      });
    }

    if (match[1] !== undefined && match[2] !== undefined) {
      segments.push({ type: "bold", content: match[2] });
    } else if (match[3] !== undefined && match[4] !== undefined) {
      segments.push({ type: "code", content: match[4] });
    } else if (match[5] !== undefined && match[6] !== undefined && match[7] !== undefined) {
      segments.push({ type: "link", text: match[6], url: match[7] });
    }

    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < line.length) {
    segments.push({
      type: "text",
      content: line.slice(lastIndex),
    });
  }

  return segments;
}

export function parseReleaseNotes(rawBody: string): ParsedChangelog {
  if (!rawBody || !rawBody.trim()) {
    return { sections: [], isMaintenance: true };
  }

  const normalized = rawBody.replace(/\r\n/g, "\n");
  const cutoffMatch = DOWNLOADS_CUTOFF_REGEX.exec(normalized);
  const cleanBody = (cutoffMatch ? normalized.slice(0, cutoffMatch.index) : normalized).trim();

  if (!cleanBody || /^maintenance release\.?$/i.test(cleanBody)) {
    return { sections: [], isMaintenance: true };
  }

  const sections: ChangelogSection[] = [];
  let currentSection: ChangelogSection | null = null;
  let currentParagraphLines: string[] = [];
  let currentNoteLines: string[] = [];

  const flushParagraph = () => {
    if (currentParagraphLines.length > 0) {
      if (!currentSection) {
        currentSection = { title: "", paragraphs: [], items: [], notes: [] };
        sections.push(currentSection);
      }
      currentSection.paragraphs ??= [];
      currentSection.paragraphs.push(parseInlineSegments(currentParagraphLines.join(" ")));
      currentParagraphLines = [];
    }
  };

  const flushNote = () => {
    if (currentNoteLines.length > 0) {
      if (!currentSection) {
        currentSection = { title: "", paragraphs: [], items: [], notes: [] };
        sections.push(currentSection);
      }
      currentSection.notes ??= [];
      currentSection.notes.push(parseInlineSegments(currentNoteLines.join(" ")));
      currentNoteLines = [];
    }
  };

  const flushAll = () => {
    flushParagraph();
    flushNote();
  };

  for (const rawLine of cleanBody.split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      flushAll();
      continue;
    }

    const headingMatch = /^#{2,3}\s+(.+)$/.exec(line);
    if (headingMatch?.[1]) {
      flushAll();
      currentSection = {
        title: headingMatch[1].trim(),
        paragraphs: [],
        items: [],
        notes: [],
      };
      sections.push(currentSection);
      continue;
    }

    if (/^(?:[-*_]\s*){3,}$/.test(line)) {
      flushAll();
      continue;
    }

    const bulletMatch = /^[-*]\s+(.+)$/.exec(line);
    if (bulletMatch?.[1]) {
      flushAll();
      if (!currentSection) {
        currentSection = { title: "", paragraphs: [], items: [], notes: [] };
        sections.push(currentSection);
      }
      currentSection.items.push(parseInlineSegments(bulletMatch[1].trim()));
      continue;
    }

    const noteMatch = /^>\s*(.+)$/.exec(line);
    if (noteMatch?.[1]) {
      flushParagraph();
      currentNoteLines.push(noteMatch[1].trim());
      continue;
    }

    flushNote();
    currentParagraphLines.push(line);
  }

  flushAll();

  const populatedSections = sections.filter(
    (section) =>
      section.items.length > 0 ||
      (section.paragraphs && section.paragraphs.length > 0) ||
      (section.notes && section.notes.length > 0)
  );

  if (populatedSections.length === 0) {
    return { sections: [], isMaintenance: true };
  }

  return {
    sections: populatedSections,
    isMaintenance: false,
  };
}
