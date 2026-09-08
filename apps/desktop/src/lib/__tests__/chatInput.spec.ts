import { describe, it, expect } from "vitest";
import { calculateEmoteInsertion, generateHtmlFromText } from "../chatInput";

describe("chatInput utility unit tests", () => {
  describe("calculateEmoteInsertion", () => {
    it("should append emote at the end when caret is at the end of text", () => {
      // Arrange
      const text = "hello";
      const offsets = { start: 5, end: 5 };
      const emoteName = "Kappa";
      const hasUserInteracted = true;

      // Act
      const result = calculateEmoteInsertion(text, offsets, emoteName, hasUserInteracted);

      // Assert
      expect(result.newText).toBe("hello Kappa ");
      expect(result.newOffset).toBe(12);
    });

    it("should not duplicate leading space if text already ends with space", () => {
      // Arrange
      const text = "hello ";
      const offsets = { start: 6, end: 6 };
      const emoteName = "Kappa";
      const hasUserInteracted = true;

      // Act
      const result = calculateEmoteInsertion(text, offsets, emoteName, hasUserInteracted);

      // Assert
      expect(result.newText).toBe("hello Kappa ");
      expect(result.newOffset).toBe(12);
    });

    it("should insert emote in the middle when caret is positioned between words", () => {
      // Arrange
      const text = "hello world";
      const offsets = { start: 5, end: 5 };
      const emoteName = "Kappa";
      const hasUserInteracted = true;

      // Act
      const result = calculateEmoteInsertion(text, offsets, emoteName, hasUserInteracted);

      // Assert
      expect(result.newText).toBe("hello Kappa world");
      expect(result.newOffset).toBe(11);
    });

    it("should insert emote at the beginning without leading space when caret is at index 0", () => {
      // Arrange
      const text = "world";
      const offsets = { start: 0, end: 0 };
      const emoteName = "Kappa";
      const hasUserInteracted = true;

      // Act
      const result = calculateEmoteInsertion(text, offsets, emoteName, hasUserInteracted);

      // Assert
      expect(result.newText).toBe("Kappa world");
      expect(result.newOffset).toBe(6);
    });

    it("should insert emote into empty text", () => {
      // Arrange
      const text = "";
      const offsets = { start: 0, end: 0 };
      const emoteName = "Kappa";
      const hasUserInteracted = false;

      // Act
      const result = calculateEmoteInsertion(text, offsets, emoteName, hasUserInteracted);

      // Assert
      expect(result.newText).toBe("Kappa ");
      expect(result.newOffset).toBe(6);
    });

    it("should replace selected text range when range is highlighted", () => {
      // Arrange
      const text = "hello world";
      const offsets = { start: 0, end: 5 };
      const emoteName = "Kappa";
      const hasUserInteracted = true;

      // Act
      const result = calculateEmoteInsertion(text, offsets, emoteName, hasUserInteracted);

      // Assert
      expect(result.newText).toBe("Kappa world");
      expect(result.newOffset).toBe(5);
    });

    it("should append to the end if user has not interacted with pre-existing text", () => {
      // Arrange
      const text = "draft text";
      const offsets = { start: 0, end: 0 };
      const emoteName = "Kappa";
      const hasUserInteracted = false;

      // Act
      const result = calculateEmoteInsertion(text, offsets, emoteName, hasUserInteracted);

      // Assert
      expect(result.newText).toBe("draft text Kappa ");
      expect(result.newOffset).toBe(17);
    });

    it("should handle consecutive emote insertions correctly", () => {
      // Arrange
      const initialText = "hello";
      const firstOffsets = { start: 5, end: 5 };
      const hasUserInteracted = true;

      // Act
      const step1 = calculateEmoteInsertion(initialText, firstOffsets, "Kappa", hasUserInteracted);
      const step2 = calculateEmoteInsertion(
        step1.newText,
        { start: step1.newOffset, end: step1.newOffset },
        "LUL",
        hasUserInteracted
      );

      // Assert
      expect(step1.newText).toBe("hello Kappa ");
      expect(step2.newText).toBe("hello Kappa LUL ");
      expect(step2.newOffset).toBe(16);
    });

    it("should normalize inverted selection offsets where start is greater than end", () => {
      // Arrange
      const text = "hello world";
      const offsets = { start: 5, end: 0 };
      const emoteName = "Kappa";
      const hasUserInteracted = true;

      // Act
      const result = calculateEmoteInsertion(text, offsets, emoteName, hasUserInteracted);

      // Assert
      expect(result.newText).toBe("Kappa world");
      expect(result.newOffset).toBe(5);
    });

    it("should clamp offsets that exceed text length", () => {
      // Arrange
      const text = "test";
      const offsets = { start: 99, end: 99 };
      const emoteName = "Kappa";
      const hasUserInteracted = true;

      // Act
      const result = calculateEmoteInsertion(text, offsets, emoteName, hasUserInteracted);

      // Assert
      expect(result.newText).toBe("test Kappa ");
      expect(result.newOffset).toBe(11);
    });

    it("should clamp negative offsets to 0", () => {
      // Arrange
      const text = "test";
      const offsets = { start: -5, end: -2 };
      const emoteName = "Kappa";
      const hasUserInteracted = true;

      // Act
      const result = calculateEmoteInsertion(text, offsets, emoteName, hasUserInteracted);

      // Assert
      expect(result.newText).toBe("Kappa test");
      expect(result.newOffset).toBe(6);
    });
  });

  describe("generateHtmlFromText", () => {
    it("should convert known emote codes into img tags", () => {
      // Arrange
      const emotes = new Map([["Kappa", { url: "https://cdn.example.com/kappa.png" }]]);
      const text = "hello Kappa world";

      // Act
      const html = generateHtmlFromText(text, emotes);

      // Assert
      expect(html).toContain('data-emote-name="Kappa"');
      expect(html).toContain('src="https://cdn.example.com/kappa.png"');
      expect(html).toContain("hello ");
      expect(html).toContain(" world");
    });

    it("should escape special HTML characters in plain text", () => {
      // Arrange
      const emotes = new Map<string, { url: string }>();
      const text = `<script>alert("xss")</script> & 'foo'`;

      // Act
      const html = generateHtmlFromText(text, emotes);

      // Assert
      expect(html).toBe("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &#39;foo&#39;");
    });

    it("should escape quotes and special characters in emote attributes", () => {
      // Arrange
      const emotes = new Map([
        ['<3"onmouseover="alert(1)', { url: 'https://cdn.example.com/heart.png?foo="bar"' }],
      ]);
      const text = '<3"onmouseover="alert(1)';

      // Act
      const html = generateHtmlFromText(text, emotes);

      // Assert
      expect(html).toContain('src="https://cdn.example.com/heart.png?foo=&quot;bar&quot;"');
      expect(html).toContain('data-emote-name="&lt;3&quot;onmouseover=&quot;alert(1)"');
      expect(html).toContain('alt="&lt;3&quot;onmouseover=&quot;alert(1)"');
      expect(html).not.toContain('<3"');
    });

    it("should convert newlines to br tags", () => {
      // Arrange
      const emotes = new Map<string, { url: string }>();
      const text = "line1\nline2";

      // Act
      const html = generateHtmlFromText(text, emotes);

      // Assert
      expect(html).toBe("line1<br>line2");
    });
  });
});
