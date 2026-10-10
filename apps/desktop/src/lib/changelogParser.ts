export type InlineSegment =
  | { type: "text"; content: string }
  | { type: "bold"; content: string }
  | { type: "code"; content: string }
  | { type: "link"; text: string; url: string };

export interface ChangelogSection {
  title: string;
  items: InlineSegment[][];
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

  for (const rawLine of cleanBody.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const headingMatch = /^#{2,3}\s+(.+)$/.exec(line);
    if (headingMatch?.[1]) {
      currentSection = {
        title: headingMatch[1].trim(),
        items: [],
      };
      sections.push(currentSection);
      continue;
    }

    if (/^(?:[-*_]\s*){3,}$/.test(line)) {
      continue;
    }

    const bulletMatch = /^[-*]\s+(.+)$/.exec(line);
    if (bulletMatch?.[1]) {
      if (!currentSection) {
        currentSection = { title: "", items: [] };
        sections.push(currentSection);
      }
      currentSection.items.push(parseInlineSegments(bulletMatch[1].trim()));
    }
  }

  const populatedSections = sections.filter((section) => section.items.length > 0);
  if (populatedSections.length === 0) {
    return { sections: [], isMaintenance: true };
  }

  return {
    sections: populatedSections,
    isMaintenance: false,
  };
}
