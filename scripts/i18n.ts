/// <reference types="@types/bun" />

import {
  SUPPORTED_LANGS,
  type Lang,
  type JsonTree,
  validateKeyPath,
  getNestedValue,
  setNestedValue,
  deleteNestedValue,
  sortObjectKeys,
  flattenKeys,
  parseCliArgs,
} from "../apps/desktop/src/i18n/utils";

export {
  SUPPORTED_LANGS,
  type Lang,
  type JsonTree,
  isSupportedLang,
  validateKeyPath,
  getNestedValue,
  setNestedValue,
  deleteNestedValue,
  sortObjectKeys,
  flattenKeys,
  parseCliArgs,
} from "../apps/desktop/src/i18n/utils";

const LOCALES_DIR = `${import.meta.dir}/../apps/desktop/src/i18n/locales`;

export function getLocalePath(lang: Lang): string {
  return `${LOCALES_DIR}/${lang}.json`;
}

interface LocaleContext {
  raw: string;
  eol: string;
}

const fileContexts = new Map<Lang, LocaleContext>();

export function __test_reset(): void {
  fileContexts.clear();
}

export async function loadLocale(lang: Lang): Promise<JsonTree> {
  const filePath = getLocalePath(lang);
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return {};
  }

  const raw = await file.text();
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  fileContexts.set(lang, { raw, eol });

  const clean = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  try {
    return JSON.parse(clean) as JsonTree;
  } catch (err) {
    console.error(`Error: failed to parse ${lang}.json as valid JSON:`, err);
    throw err;
  }
}

export async function saveLocale(lang: Lang, data: JsonTree): Promise<void> {
  const filePath = getLocalePath(lang);
  const context = fileContexts.get(lang);

  let eol = context?.eol;
  if (!eol) {
    const file = Bun.file(filePath);
    if (await file.exists()) {
      try {
        const existing = await file.text();
        eol = existing.includes("\r\n") ? "\r\n" : "\n";
      } catch {
        eol = "\n";
      }
    } else {
      const enFile = Bun.file(getLocalePath("en"));
      try {
        const enRaw = (await enFile.exists()) ? await enFile.text() : "";
        eol = enRaw.includes("\r\n") ? "\r\n" : "\n";
      } catch {
        eol = "\n";
      }
    }
  }

  const formatted = JSON.stringify(data, null, 2).replace(/\r?\n/g, eol) + eol;

  if (context && formatted === context.raw) {
    return;
  }

  await Bun.write(filePath, formatted);

  if (context) {
    context.raw = formatted;
  } else {
    fileContexts.set(lang, { raw: formatted, eol });
  }
}

async function cmdGet(keyPath: string): Promise<void> {
  if (!keyPath) {
    console.error("Usage: bun run scripts/i18n.ts get <key.path>");
    process.exit(1);
  }

  try {
    validateKeyPath(keyPath);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }

  console.log(`Key: "${keyPath}"\n`);
  let foundCount = 0;

  for (const lang of SUPPORTED_LANGS) {
    const data = await loadLocale(lang);
    const val = getNestedValue(data, keyPath);
    if (val !== undefined) {
      foundCount++;
      if (typeof val === "object") {
        console.log(`  ${lang.padEnd(5)} [group: ${Object.keys(val || {}).length} keys]`);
      } else {
        console.log(`  ${lang.padEnd(5)} "${val}"`);
      }
    } else {
      console.log(`  ${lang.padEnd(5)} (missing)`);
    }
  }

  console.log("");
  if (foundCount === 0) {
    process.exit(1);
  }
}

async function cmdSet(keyPath: string, args: Record<string, string>): Promise<void> {
  if (!keyPath) {
    console.error(
      'Usage: bun run scripts/i18n.ts set <key.path> --en "..." --pt "..." [--all "fallback"]'
    );
    process.exit(1);
  }

  try {
    validateKeyPath(keyPath);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }

  const validFlags = new Set<string>([...SUPPORTED_LANGS, "all", "default"]);
  for (const flag of Object.keys(args)) {
    if (!validFlags.has(flag)) {
      console.error(
        `Error: unknown flag "--${flag}". Supported flags: ${SUPPORTED_LANGS.map((l) => `--${l}`).join(", ")}, --all`
      );
      process.exit(1);
    }
  }

  const fallback = args.all ?? args.default;
  let updatedCount = 0;

  for (const lang of SUPPORTED_LANGS) {
    const val = args[lang] ?? fallback;
    if (val !== undefined) {
      const data = await loadLocale(lang);
      try {
        setNestedValue(data, keyPath, val);
      } catch (err) {
        console.error(`Error updating ${lang}: ${(err as Error).message}`);
        process.exit(1);
      }
      await saveLocale(lang, data);
      console.log(`  [updated] ${lang}: "${val}"`);
      updatedCount++;
    }
  }

  if (updatedCount === 0) {
    console.error("Error: no translations provided to update. Specify language flags or --all.");
    process.exit(1);
  }

  console.log(`\nUpdated "${keyPath}" in ${updatedCount}/${SUPPORTED_LANGS.length} locales.\n`);
  if (updatedCount < SUPPORTED_LANGS.length) {
    console.log(
      `[warning] Only ${updatedCount}/${SUPPORTED_LANGS.length} locales were updated. Run i18n:check to inspect parity.`
    );
  }
}

async function cmdDelete(keyPath: string): Promise<void> {
  if (!keyPath) {
    console.error("Usage: bun run scripts/i18n.ts delete <key.path>");
    process.exit(1);
  }

  try {
    validateKeyPath(keyPath);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }

  let deletedCount = 0;
  for (const lang of SUPPORTED_LANGS) {
    const data = await loadLocale(lang);
    if (deleteNestedValue(data, keyPath)) {
      await saveLocale(lang, data);
      console.log(`  [deleted] ${lang}`);
      deletedCount++;
    }
  }

  console.log(`\nDeleted "${keyPath}" from ${deletedCount} locales.\n`);
  if (deletedCount === 0) {
    console.log(`[warning] Key "${keyPath}" was not found in any locale.`);
  }
}

async function cmdCheck(): Promise<void> {
  console.log("Checking i18n parity across all 10 locales...\n");
  const enData = await loadLocale("en");
  const enKeys = new Set(flattenKeys(enData));
  let hasErrors = false;

  for (const lang of SUPPORTED_LANGS) {
    if (lang === "en") continue;
    const targetData = await loadLocale(lang);
    const targetKeys = new Set(flattenKeys(targetData));

    const missing = [...enKeys].filter((k) => !targetKeys.has(k));
    const extra = [...targetKeys].filter((k) => !enKeys.has(k));
    const emptyValues: string[] = [];

    for (const key of targetKeys) {
      if (enKeys.has(key)) {
        const val = getNestedValue(targetData, key);
        const enVal = getNestedValue(enData, key);
        if (
          typeof val === "string" &&
          val.trim() === "" &&
          typeof enVal === "string" &&
          enVal.trim() !== ""
        ) {
          emptyValues.push(key);
        }
      }
    }

    if (missing.length === 0 && extra.length === 0 && emptyValues.length === 0) {
      console.log(`  [ok]   ${lang.padEnd(5)} (${targetKeys.size} keys)`);
    } else {
      hasErrors = true;
      console.log(`  [diff] ${lang.padEnd(5)}:`);
      if (missing.length > 0) {
        console.log(
          `    missing (${missing.length}): ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "..." : ""}`
        );
      }
      if (extra.length > 0) {
        console.log(
          `    extra (${extra.length}): ${extra.slice(0, 5).join(", ")}${extra.length > 5 ? "..." : ""}`
        );
      }
      if (emptyValues.length > 0) {
        console.log(
          `    empty (${emptyValues.length}): ${emptyValues.slice(0, 5).join(", ")}${emptyValues.length > 5 ? "..." : ""}`
        );
      }
    }
  }

  if (hasErrors) {
    console.error("\nParity check failed: some locales are out of sync with en.json.\n");
    process.exit(1);
  } else {
    console.log("\nAll 10 locales are in sync.\n");
  }
}

async function cmdSort(): Promise<void> {
  console.log("Sorting keys alphabetically across all 10 locales...\n");
  for (const lang of SUPPORTED_LANGS) {
    const data = await loadLocale(lang);
    const sorted = sortObjectKeys(data);
    await saveLocale(lang, sorted);
    console.log(`  [sorted] ${lang}`);
  }
  console.log("\nDone.\n");
}

async function cmdBatch(batchFilePath: string): Promise<void> {
  if (!batchFilePath) {
    console.error("Usage: bun run scripts/i18n.ts batch <path/to/updates.json>");
    console.error('Format expected: { "some.key.path": { "en": "...", "pt": "..." } }');
    process.exit(1);
  }

  const batchFile = Bun.file(batchFilePath);
  if (!(await batchFile.exists())) {
    console.error(`Error: batch file not found at "${batchFilePath}"`);
    process.exit(1);
  }

  let batchData: Record<string, Record<string, string>>;
  try {
    const raw = await batchFile.text();
    const clean = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    batchData = JSON.parse(clean) as Record<string, Record<string, string>>;
  } catch (err) {
    console.error(`Error reading batch file "${batchFilePath}": ${(err as Error).message}`);
    process.exit(1);
  }

  if (typeof batchData !== "object" || batchData === null || Array.isArray(batchData)) {
    console.error(
      "Error: batch file root must be a JSON object mapping key paths to locale dictionaries"
    );
    process.exit(1);
  }

  const keys = Object.keys(batchData);
  for (const keyPath of keys) {
    try {
      validateKeyPath(keyPath);
    } catch (err) {
      console.error(`Error in batch key "${keyPath}": ${(err as Error).message}`);
      process.exit(1);
    }
    const translations = batchData[keyPath];
    if (typeof translations !== "object" || translations === null || Array.isArray(translations)) {
      console.error(`Error in batch key "${keyPath}": value must be an object with translations`);
      process.exit(1);
    }
  }

  console.log(`Applying batch update for ${keys.length} keys across all locales...\n`);

  for (const lang of SUPPORTED_LANGS) {
    const localeData = await loadLocale(lang);
    let langUpdates = 0;

    for (const [keyPath, translations] of Object.entries(batchData)) {
      const val = translations[lang] ?? translations["all"] ?? translations["default"];
      if (val !== undefined) {
        setNestedValue(localeData, keyPath, val);
        langUpdates++;
      }
    }

    await saveLocale(lang, localeData);
    console.log(`  [applied] ${lang}: ${langUpdates} keys`);
  }

  console.log("\nDone.\n");
}

function printHelp(): void {
  console.log(`Multistream i18n CLI
Supported languages: ${SUPPORTED_LANGS.join(", ")}

Usage:
  bun run scripts/i18n.ts <command> [options]

Commands:
  get <key.path>
    Print translation for a key across all 10 locales.
    Example: bun run i18n get onboarding.step1.title

  set <key.path> --en "..." --pt "..." [--all "fallback"]
    Update or insert a key across specified locales (or all with --all).
    Example: bun run i18n set nav.help --en "Help" --pt "Ajuda" --all "Help"

  delete <key.path>
    Remove a key from all 10 locales and prune empty parents.
    Example: bun run i18n delete nav.oldLink

  check
    Verify parity and consistency across all 10 locales against en.json.
    Example: bun run i18n:check

  sort
    Alphabetically sort and format all 10 locale JSON files.
    Example: bun run i18n:sort

  batch <file.json>
    Apply a dictionary of updates across all locales at once.
    Example: bun run i18n batch updates.json
`);
}

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const [command, target, ...restArgs] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  switch (command) {
    case "get":
      await cmdGet(target);
      break;
    case "set":
      await cmdSet(target, parseCliArgs(restArgs));
      break;
    case "delete":
    case "del":
    case "rm":
      await cmdDelete(target);
      break;
    case "check":
    case "verify":
      await cmdCheck();
      break;
    case "sort":
    case "format":
      await cmdSort();
      break;
    case "batch":
      await cmdBatch(target);
      break;
    default:
      console.error(`Error: unknown command "${command}"`);
      printHelp();
      process.exit(1);
  }
}

if (import.meta.main) {
  await runCli();
}
