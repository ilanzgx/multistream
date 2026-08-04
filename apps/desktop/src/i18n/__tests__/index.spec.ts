import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getDefaultLocale } from "../index";

describe("i18n: getDefaultLocale unit tests", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return the 'locale' saved in localStorage if supported", () => {
    // Arrange
    localStorage.setItem("locale", "pt");

    // Act
    const result = getDefaultLocale();

    // Assert
    expect(result).toBe("pt");
  });

  it("should ignore localStorage if saved 'locale' is fundamentally unsupported", () => {
    // Arrange
    localStorage.setItem("locale", "fr"); // French is not supported
    vi.stubGlobal("navigator", { language: "en-US" }); // Make sure we stub navigator to English to test the fallback properly

    // Act
    const result = getDefaultLocale();

    // Assert
    expect(result).toBe("en"); // fell back to navigator's English!
  });

  it("should parse navigator.language correctly stripping out regions (e.g. pt-BR -> pt)", () => {
    // Arrange
    vi.stubGlobal("navigator", { language: "pt-BR" }); // no localstorage

    // Act
    const result = getDefaultLocale();

    // Assert
    expect(result).toBe("pt");
  });

  it("should fallback to 'en' if navigator.language is undefined or unsupported", () => {
    // Arrange
    vi.stubGlobal("navigator", { language: "ja-JP" }); // japanese is not supported

    // Act
    const result = getDefaultLocale();

    // Assert
    expect(result).toBe("en");
  });

  it("should fallback to 'en' without crashing if the global navigator object itself is undefined", () => {
    // Arrange
    vi.stubGlobal("navigator", undefined); // Node.js doesn't have navigator if not stubbed

    // Act
    const result = getDefaultLocale();

    // Assert
    expect(result).toBe("en");
  });
});
