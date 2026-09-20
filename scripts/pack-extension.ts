/// <reference types="@types/bun" />

const rootDir = `${import.meta.dir}/..`;
const extensionDir = `${rootDir}/apps/extension`;
const defaultZip = `${extensionDir}/dist/multistream-extension.zip`;

const isCheckOnly = process.argv.includes("--check");

const check = await Bun.build({
  entrypoints: [`${extensionDir}/background.js`],
  target: "browser",
});

if (!check.success) {
  console.error("Syntax or parsing error in background.js:");
  for (const message of check.logs) {
    console.error(message);
  }
  process.exit(1);
}

if (isCheckOnly) {
  console.log("Syntax check passed for background.js");
  process.exit(0);
}

const targetZip =
  process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : defaultZip;
const targetDir =
  targetZip.includes("/") || targetZip.includes("\\")
    ? targetZip.replace(/[/\\][^/\\]+$/, "")
    : ".";

const placeholder = Bun.file(`${targetDir}/.keep`);
await Bun.write(placeholder, "");
await placeholder.delete();

const filesToInclude = ["manifest.json", "background.js", "icons", "README.md"];

const isWindowsOrMac = process.platform === "win32" || process.platform === "darwin";
const tarExe = process.platform === "win32" ? "C:\\Windows\\System32\\tar.exe" : "tar";

const proc = isWindowsOrMac
  ? Bun.spawnSync([tarExe, "-a", "-c", "-f", targetZip, "-C", extensionDir, ...filesToInclude])
  : Bun.spawnSync({
      cmd: ["zip", "-r", targetZip, ...filesToInclude],
      cwd: extensionDir,
    });

if (proc.exitCode !== 0) {
  console.error("Failed to pack extension:", proc.stderr.toString());
  process.exit(1);
}

const file = Bun.file(targetZip);
const sizeKb = (file.size / 1024).toFixed(1);

console.log(`Successfully packed browser extension:`);
console.log(`  Path: ${targetZip}`);
console.log(`  Size: ${sizeKb} KB`);

export const packed = true;
