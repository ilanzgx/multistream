import { describe, it, expect } from "vitest";
import {
  validateKeyPath,
  getNestedValue,
  setNestedValue,
  deleteNestedValue,
  sortObjectKeys,
  flattenKeys,
  parseCliArgs,
  isSupportedLang,
  SUPPORTED_LANGS,
} from "../utils";

describe("i18n utilities critical edge case unit tests", () => {
  describe("isSupportedLang", () => {
    it("should recognize all 10 supported languages", () => {
      // Arrange
      const expected = ["en", "pt", "es", "de", "cn", "ru", "fr", "tr", "hi", "id"];

      // Act & Assert
      expect(SUPPORTED_LANGS).toEqual(expected);
      for (const lang of expected) {
        expect(isSupportedLang(lang)).toBe(true);
      }
    });

    it("should reject unsupported languages or typos", () => {
      // Arrange & Act & Assert
      expect(isSupportedLang("english")).toBe(false);
      expect(isSupportedLang("br")).toBe(false);
      expect(isSupportedLang("jp")).toBe(false);
      expect(isSupportedLang("")).toBe(false);
    });
  });

  describe("validateKeyPath & Prototype Pollution Protection", () => {
    it("should validate and parse well-formed key paths", () => {
      // Arrange
      const path = "onboarding.step1.title";

      // Act
      const parts = validateKeyPath(path);

      // Assert
      expect(parts).toEqual(["onboarding", "step1", "title"]);
    });

    it("should trim surrounding whitespace from path and segments", () => {
      // Arrange
      const path = "  nav . settings . theme  ";

      // Act
      const parts = validateKeyPath(path);

      // Assert
      expect(parts).toEqual(["nav", "settings", "theme"]);
    });

    it("should throw on empty string or whitespace-only paths", () => {
      // Arrange & Act & Assert
      expect(() => validateKeyPath("")).toThrow("path cannot be empty");
      expect(() => validateKeyPath("   ")).toThrow("path cannot be empty");
    });

    it("should throw on empty segments like leading, trailing, or double dots", () => {
      // Arrange & Act & Assert
      expect(() => validateKeyPath(".onboarding")).toThrow("contains empty segments");
      expect(() => validateKeyPath("onboarding.")).toThrow("contains empty segments");
      expect(() => validateKeyPath("onboarding..title")).toThrow("contains empty segments");
    });

    it("should throw a security error on prototype pollution attempts", () => {
      // Arrange & Act & Assert
      expect(() => validateKeyPath("__proto__.polluted")).toThrow("forbidden key");
      expect(() => validateKeyPath("settings.constructor.name")).toThrow("forbidden key");
      expect(() => validateKeyPath("prototype.malicious")).toThrow("forbidden key");
    });
  });

  describe("getNestedValue", () => {
    it("should retrieve deeply nested string values", () => {
      // Arrange
      const tree = { a: { b: { c: "hello" } } };

      // Act
      const result = getNestedValue(tree, "a.b.c");

      // Assert
      expect(result).toBe("hello");
    });

    it("should return undefined for non-existent paths without throwing", () => {
      // Arrange
      const tree = { a: { b: "hello" } };

      // Act
      const result = getNestedValue(tree, "a.b.c.d");

      // Assert
      expect(result).toBeUndefined();
    });

    it("should not leak Object.prototype methods when accessed via keyPath", () => {
      // Arrange
      const tree = {};

      // Act
      const toStringVal = getNestedValue(tree, "toString");
      const valueOfVal = getNestedValue(tree, "valueOf");

      // Assert
      expect(toStringVal).toBeUndefined();
      expect(valueOfVal).toBeUndefined();
    });
  });

  describe("setNestedValue", () => {
    it("should insert nested values into an empty object", () => {
      // Arrange
      const tree = {};

      // Act
      setNestedValue(tree, "nav.links.home", "Início");

      // Assert
      expect(tree).toEqual({
        nav: {
          links: {
            home: "Início",
          },
        },
      });
    });

    it("should prevent prototype pollution from modifying runtime object prototype", () => {
      // Arrange
      const tree = {};

      // Act & Assert
      expect(() => setNestedValue(tree, "__proto__.polluted", "hacked")).toThrow("forbidden key");
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it("should throw when trying to create a child under an existing primitive string (collision protection)", () => {
      // Arrange
      const tree = { nav: "Navigation" };

      // Act & Assert
      expect(() => setNestedValue(tree, "nav.links.home", "Home")).toThrow(
        'Collision: cannot create nested key "nav" because it is already a primitive value'
      );
    });

    it("should throw when trying to overwrite an object group with a primitive string (subtree destruction protection)", () => {
      // Arrange
      const tree = { settings: { theme: "dark", lang: "en" } };

      // Act & Assert
      expect(() => setNestedValue(tree, "settings", "Settings text")).toThrow(
        'Collision: cannot overwrite object group at "settings" with a primitive value'
      );
      expect(tree.settings).toEqual({ theme: "dark", lang: "en" });
    });
  });

  describe("deleteNestedValue", () => {
    it("should delete leaf properties and prune empty parent objects", () => {
      // Arrange
      const tree = { a: { b: { c: "delete me" } }, other: "keep" };

      // Act
      const deleted = deleteNestedValue(tree, "a.b.c");

      // Assert
      expect(deleted).toBe(true);
      expect(tree).toEqual({ other: "keep" });
    });

    it("should preserve sibling properties when deleting one leaf", () => {
      // Arrange
      const tree = { a: { b: { c: "delete me", d: "keep me" } } };

      // Act
      const deleted = deleteNestedValue(tree, "a.b.c");

      // Assert
      expect(deleted).toBe(true);
      expect(tree).toEqual({ a: { b: { d: "keep me" } } });
    });

    it("should return false and not delete anything for inherited prototype properties", () => {
      // Arrange
      const tree = {};

      // Act
      const deleted = deleteNestedValue(tree, "toString");

      // Assert
      expect(deleted).toBe(false);
      expect(Object.hasOwn(tree, "toString")).toBe(false);
    });

    it("should return false when target path does not exist", () => {
      // Arrange
      const tree = { a: { b: "val" } };

      // Act
      const deleted = deleteNestedValue(tree, "a.nonexistent");

      // Assert
      expect(deleted).toBe(false);
    });
  });

  describe("sortObjectKeys", () => {
    it("should recursively sort keys in alphabetical order", () => {
      // Arrange
      const unsorted = {
        z: "last",
        a: "first",
        m: {
          z: "sub-last",
          b: "sub-first",
        },
      };

      // Act
      const sorted = sortObjectKeys(unsorted);

      // Assert
      expect(Object.keys(sorted)).toEqual(["a", "m", "z"]);
      expect(Object.keys(sorted.m as Record<string, unknown>)).toEqual(["b", "z"]);
    });
  });

  describe("flattenKeys", () => {
    it("should flatten deep trees into dotted key paths", () => {
      // Arrange
      const tree = {
        onboarding: {
          step1: {
            title: "Welcome",
            subtitle: "Start here",
          },
        },
        common: {
          ok: "OK",
        },
      };

      // Act
      const keys = flattenKeys(tree);

      // Assert
      expect(keys).toEqual(["onboarding.step1.title", "onboarding.step1.subtitle", "common.ok"]);
    });
  });

  describe("parseCliArgs", () => {
    it("should parse flags with space-separated values", () => {
      // Arrange
      const args = ["--en", "Hello", "--pt", "Olá"];

      // Act
      const parsed = parseCliArgs(args);

      // Assert
      expect(parsed).toEqual({ en: "Hello", pt: "Olá" });
    });

    it("should parse flags with equals syntax (--key=value)", () => {
      // Arrange
      const args = ["--en=Hello World", "--pt=Olá Mundo"];

      // Act
      const parsed = parseCliArgs(args);

      // Assert
      expect(parsed).toEqual({ en: "Hello World", pt: "Olá Mundo" });
    });

    it("should normalize flag names to lowercase", () => {
      // Arrange
      const args = ["--EN", "Hello", "--PT=Olá"];

      // Act
      const parsed = parseCliArgs(args);

      // Assert
      expect(parsed).toEqual({ en: "Hello", pt: "Olá" });
    });

    it("should preserve empty string values instead of converting to 'true'", () => {
      // Arrange
      const args = ["--en", "", "--pt="];

      // Act
      const parsed = parseCliArgs(args);

      // Assert
      expect(parsed.en).toBe("");
      expect(parsed.pt).toBe("");
    });

    it("should support boolean flags when no value follows", () => {
      // Arrange
      const args = ["--all", "--verbose"];

      // Act
      const parsed = parseCliArgs(args);

      // Assert
      expect(parsed.all).toBe("true");
      expect(parsed.verbose).toBe("true");
    });

    it("should support values containing dashes when using equals syntax", () => {
      // Arrange
      const args = ["--en=--flag-example"];

      // Act
      const parsed = parseCliArgs(args);

      // Assert
      expect(parsed.en).toBe("--flag-example");
    });
  });
});
