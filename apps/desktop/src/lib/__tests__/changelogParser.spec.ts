import { describe, it, expect } from "vitest";
import { parseReleaseNotes, parseInlineSegments } from "../changelogParser";

describe("changelogParser unit tests", () => {
  describe("parseInlineSegments", () => {
    it("should parse scoped bold text, plain text, inline code, and commit link", () => {
      // Arrange
      const line =
        "**ui**: Add `ChangelogDialog` component ([a1b2c3d](https://github.com/ilanzgx/multistream/commit/a1b2c3d))";

      // Act
      const segments = parseInlineSegments(line);

      // Assert
      expect(segments).toEqual([
        { type: "bold", content: "ui" },
        { type: "text", content: ": Add " },
        { type: "code", content: "ChangelogDialog" },
        { type: "text", content: " component (" },
        {
          type: "link",
          text: "a1b2c3d",
          url: "https://github.com/ilanzgx/multistream/commit/a1b2c3d",
        },
        { type: "text", content: ")" },
      ]);
    });

    it("should ignore non-http/https links and treat them as plain text", () => {
      // Arrange
      const line = "Click [here](javascript:alert(1)) for details";

      // Act
      const segments = parseInlineSegments(line);

      // Assert
      expect(segments).toEqual([
        { type: "text", content: "Click [here](javascript:alert(1)) for details" },
      ]);
    });
  });

  describe("parseReleaseNotes", () => {
    it("should parse release sections and strip everything from ## Downloads onwards", () => {
      // Arrange
      const rawMarkdown = [
        "### Features",
        "- **ui**: Add share dialog ([111aaaa](https://github.com/ilanzgx/multistream/commit/111aaaa))",
        "- Support global shortcuts ([222bbbb](https://github.com/ilanzgx/multistream/commit/222bbbb))",
        "",
        "### Bug Fixes",
        "- **kick**: Fix websocket reconnect ([333cccc](https://github.com/ilanzgx/multistream/commit/333cccc))",
        "",
        "## Downloads",
        "",
        "| Platform | Download |",
        "|----------|----------|",
        "| Windows (installer) | [`Multistream-windows-x64-setup.exe`](https://example.com/setup.exe) |",
        "",
        "### macOS (Homebrew)",
        "```sh",
        "brew install --cask ilanzgx/multistream/multistream",
        "```",
      ].join("\n");

      // Act
      const result = parseReleaseNotes(rawMarkdown);

      // Assert
      expect(result.isMaintenance).toBe(false);
      expect(result.sections).toHaveLength(2);
      expect(result.sections[0]?.title).toBe("Features");
      expect(result.sections[0]?.items).toHaveLength(2);
      expect(result.sections[1]?.title).toBe("Bug Fixes");
      expect(result.sections[1]?.items).toHaveLength(1);
    });

    it("should detect maintenance release when body only contains Maintenance release.", () => {
      // Arrange
      const rawMarkdown = [
        "Maintenance release.",
        "",
        "## Downloads",
        "| Platform | Download |",
      ].join("\n");

      // Act
      const result = parseReleaseNotes(rawMarkdown);

      // Assert
      expect(result.isMaintenance).toBe(true);
      expect(result.sections).toEqual([]);
    });

    it("should detect maintenance release when body is empty or whitespace", () => {
      // Arrange
      const rawMarkdown = "   \n  ";

      // Act
      const result = parseReleaseNotes(rawMarkdown);

      // Assert
      expect(result.isMaintenance).toBe(true);
      expect(result.sections).toEqual([]);
    });

    it("should group bullets without a preceding heading into a default section", () => {
      // Arrange
      const rawMarkdown =
        "- Quick hotfix ([999ffff](https://github.com/ilanzgx/multistream/commit/999ffff))";

      // Act
      const result = parseReleaseNotes(rawMarkdown);

      // Assert
      expect(result.isMaintenance).toBe(false);
      expect(result.sections).toHaveLength(1);
      expect(result.sections[0]?.title).toBe("");
      expect(result.sections[0]?.items).toHaveLength(1);
    });

    it("should ignore markdown horizontal rules between sections", () => {
      // Arrange
      const rawMarkdown = [
        "## Summary",
        "- **Highlight**: Major update",
        "",
        "---",
        "",
        "### Features",
        "- **ui**: Add dialog ([1234567](https://github.com/ilanzgx/multistream/commit/1234567))",
      ].join("\n");

      // Act
      const result = parseReleaseNotes(rawMarkdown);

      // Assert
      expect(result.isMaintenance).toBe(false);
      expect(result.sections).toHaveLength(2);
      expect(result.sections[0]?.items).toHaveLength(1);
      expect(result.sections[1]?.items).toHaveLength(1);
    });
  });
});
