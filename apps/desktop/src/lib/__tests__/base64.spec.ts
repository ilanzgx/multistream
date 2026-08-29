import { describe, it, expect } from "vitest";
import { encodeBase64, decodeBase64 } from "../base64";

describe("base64 utility unit tests", () => {
  describe("encodeBase64", () => {
    it("should encode plain ASCII strings correctly", () => {
      // Arrange
      const input = "hello world";

      // Act
      const result = encodeBase64(input);

      // Assert
      expect(result).toBe("aGVsbG8gd29ybGQ=");
    });

    it("should encode empty string", () => {
      // Arrange
      const input = "";

      // Act
      const result = encodeBase64(input);

      // Assert
      expect(result).toBe("");
    });

    it("should encode strings with Portuguese accents without throwing DOMException", () => {
      // Arrange
      const input = "Transmissão com acentuação e cedilha: á é í ó ú ç";

      // Act
      const result = encodeBase64(input);

      // Assert
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should encode emojis and unicode symbols", () => {
      // Arrange
      const input = "Gaming Stream 🎮 🔥 🚀";

      // Act
      const result = encodeBase64(input);

      // Assert
      expect(result).toBeDefined();
      expect(decodeBase64(result)).toBe(input);
    });

    it("should encode multilingual characters (Cyrillic, CJK, Hindi)", () => {
      // Arrange
      const input = "Привет мир / 日本語ストリーム / हिंदी";

      // Act
      const result = encodeBase64(input);

      // Assert
      expect(result).toBeDefined();
      expect(decodeBase64(result)).toBe(input);
    });

    it("should encode JSON payload matching custom stream format", () => {
      // Arrange
      const payload = JSON.stringify([
        { n: "Stream do Campeão 🏆", u: "https://custom.live/stream" },
        { n: "東京ライブ", u: "https://custom.jp/live" },
      ]);

      // Act
      const encoded = encodeBase64(payload);

      // Assert
      expect(encoded).toBeDefined();
      expect(decodeBase64(encoded)).toBe(payload);
    });
  });

  describe("decodeBase64", () => {
    it("should decode standard ASCII base64 strings", () => {
      // Arrange
      const input = "aGVsbG8gd29ybGQ=";

      // Act
      const result = decodeBase64(input);

      // Assert
      expect(result).toBe("hello world");
    });

    it("should decode empty string", () => {
      // Arrange
      const input = "";

      // Act
      const result = decodeBase64(input);

      // Assert
      expect(result).toBe("");
    });

    it("should decode legacy ASCII base64 without error", () => {
      // Arrange
      const legacyPayload = JSON.stringify([{ n: "regular stream", u: "https://example.com" }]);
      const b64 = btoa(legacyPayload);

      // Act
      const result = decodeBase64(b64);

      // Assert
      expect(result).toBe(legacyPayload);
    });

    it("should fallback to atob when decodeURIComponent fails", () => {
      // Arrange
      const rawBinary = String.fromCharCode(160, 161, 162);
      const b64 = btoa(rawBinary);

      // Act
      const result = decodeBase64(b64);

      // Assert
      expect(result).toBe(rawBinary);
    });

    it("should throw error if input is not valid base64", () => {
      // Arrange
      const invalidB64 = "%%%not-valid-base64%%%";

      // Act & Assert
      expect(() => decodeBase64(invalidB64)).toThrow();
    });
  });

  describe("roundtrip integrity", () => {
    it("should preserve exact content across encode and decode for arbitrary unicode", () => {
      // Arrange
      const testCases = [
        "Simple ASCII",
        "Acentuação: áéíóú àèìòù ãõ âêîôû ç Ç",
        "Emojis: 😀🎉❤️💻",
        "CJK: 你好，世界！ / こんにちは / 안녕하세요",
        "Russian: Тестирование кодировки",
        "Symbols & Math: ∑ ∏ ∫ ≈ ≠ ≤ ≥",
        JSON.stringify({ nested: { array: [1, 2, "texto com acento 🎯"] } }),
      ];

      for (const input of testCases) {
        // Act
        const encoded = encodeBase64(input);
        const decoded = decodeBase64(encoded);

        // Assert
        expect(decoded).toBe(input);
      }
    });
  });
});
