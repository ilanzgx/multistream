export const SUPPORTED_LANGS = [
  "en",
  "pt",
  "es",
  "de",
  "cn",
  "ru",
  "fr",
  "tr",
  "hi",
  "id",
] as const;

export type Lang = (typeof SUPPORTED_LANGS)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonTree = { [key: string]: JsonPrimitive | JsonTree };

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function isSupportedLang(lang: string): lang is Lang {
  return (SUPPORTED_LANGS as readonly string[]).includes(lang);
}

export function validateKeyPath(keyPath: string): string[] {
  if (typeof keyPath !== "string") {
    throw new TypeError("Key path must be a string");
  }
  const trimmed = keyPath.trim();
  if (!trimmed) {
    throw new Error("Invalid key path: path cannot be empty");
  }

  const parts = trimmed.split(".");
  for (const part of parts) {
    const p = part.trim();
    if (!p) {
      throw new Error(`Invalid key path "${keyPath}": contains empty segments`);
    }
    if (FORBIDDEN_KEYS.has(p)) {
      throw new Error(`Security error: forbidden key "${p}" in key path`);
    }
  }

  return parts.map((p) => p.trim());
}

export function getNestedValue(
  obj: JsonTree,
  keyPath: string
): JsonPrimitive | JsonTree | undefined {
  let parts: string[];
  try {
    parts = validateKeyPath(keyPath);
  } catch {
    return undefined;
  }

  let current: unknown = obj;
  for (const part of parts) {
    if (typeof current !== "object" || current === null || !Object.hasOwn(current, part)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current as JsonPrimitive | JsonTree | undefined;
}

export function setNestedValue(obj: JsonTree, keyPath: string, value: JsonPrimitive): void {
  const parts = validateKeyPath(keyPath);
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (Object.hasOwn(current, part)) {
      const existing = current[part];
      if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {
        throw new Error(
          `Collision: cannot create nested key "${part}" because it is already a primitive value`
        );
      }
    } else {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1]!;
  if (Object.hasOwn(current, lastPart)) {
    const existing = current[lastPart];
    if (typeof existing === "object" && existing !== null && !Array.isArray(existing)) {
      throw new Error(
        `Collision: cannot overwrite object group at "${lastPart}" with a primitive value`
      );
    }
  }

  current[lastPart] = value;
}

export function deleteNestedValue(obj: JsonTree, keyPath: string): boolean {
  let parts: string[];
  try {
    parts = validateKeyPath(keyPath);
  } catch {
    return false;
  }

  const ancestors: { parent: Record<string, unknown>; key: string }[] = [];
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (
      !Object.hasOwn(current, part) ||
      typeof current[part] !== "object" ||
      current[part] === null ||
      Array.isArray(current[part])
    ) {
      return false;
    }
    ancestors.push({ parent: current, key: part });
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1]!;
  if (!Object.hasOwn(current, lastPart)) {
    return false;
  }

  delete current[lastPart];

  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i]!;
    const target = ancestor.parent[ancestor.key];
    if (
      typeof target === "object" &&
      target !== null &&
      !Array.isArray(target) &&
      Object.keys(target).length === 0
    ) {
      delete ancestor.parent[ancestor.key];
    } else {
      break;
    }
  }

  return true;
}

export function sortObjectKeys(obj: JsonTree): JsonTree {
  const sorted: JsonTree = {};
  const keys = Object.keys(obj).toSorted();
  for (const key of keys) {
    const val = obj[key];
    if (val !== undefined) {
      if (typeof val === "object" && val !== null && !Array.isArray(val)) {
        sorted[key] = sortObjectKeys(val as JsonTree);
      } else {
        sorted[key] = val;
      }
    }
  }
  return sorted;
}

export function flattenKeys(obj: JsonTree, prefix = ""): string[] {
  return Object.keys(obj).reduce((res: string[], key: string) => {
    const val = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      res.push(...flattenKeys(val as JsonTree, newKey));
    } else if (val !== undefined) {
      res.push(newKey);
    }
    return res;
  }, []);
}

export function parseCliArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg || !arg.startsWith("--")) continue;

    const withoutDashes = arg.slice(2);
    const equalsIndex = withoutDashes.indexOf("=");
    if (equalsIndex !== -1) {
      const key = withoutDashes.slice(0, equalsIndex).toLowerCase();
      const value = withoutDashes.slice(equalsIndex + 1);
      result[key] = value;
    } else {
      const key = withoutDashes.toLowerCase();
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        result[key] = next;
        i++;
      } else {
        result[key] = "true";
      }
    }
  }
  return result;
}
