import { describe, it, expect } from "vitest";
import * as allLocales from "../locales";

function getKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.keys(obj).reduce((res: string[], key: string) => {
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      res.push(...getKeys(value as Record<string, unknown>, newKey));
    } else {
      res.push(newKey);
    }
    return res;
  }, []);
}

describe("i18n key consistency tests", () => {
  const { en, ...otherLocales } = allLocales;
  const enKeys = getKeys(en as Record<string, unknown>);

  Object.entries(otherLocales).forEach(([lang, content]) => {
    it(`should have all keys present in ${lang}.json matching en.json`, () => {
      // Arrange
      const targetKeys = new Set(getKeys(content as Record<string, unknown>));

      // Act
      const missingKeys = enKeys.filter((key) => !targetKeys.has(key));

      // Assert
      expect(missingKeys, `Missing keys in ${lang}.json`).toEqual([]);
    });
  });
});
