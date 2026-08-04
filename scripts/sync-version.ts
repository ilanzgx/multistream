import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const version = process.argv[2];

if (!version) {
  console.log("Use: bun run version <version>");
  console.log("Example: bun run version 0.1.3");
  process.exit(1);
}

// Root package.json
const rootPkgPath = path.join(__dirname, "../package.json");
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
rootPkg.version = version;
fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + "\n");

// Desktop package.json
const desktopPkgPath = path.join(__dirname, "../apps/desktop/package.json");
const desktopPkg = JSON.parse(fs.readFileSync(desktopPkgPath, "utf8"));
desktopPkg.version = version;
fs.writeFileSync(desktopPkgPath, JSON.stringify(desktopPkg, null, 2) + "\n");

// Website package.json
const websitePkgPath = path.join(__dirname, "../apps/website/package.json");
const websitePkg = JSON.parse(fs.readFileSync(websitePkgPath, "utf8"));
websitePkg.version = version;
fs.writeFileSync(websitePkgPath, JSON.stringify(websitePkg, null, 2) + "\n");

// tauri.conf.json
const tauriPath = path.join(__dirname, "../apps/desktop/src-tauri/tauri.conf.json");
const tauri = JSON.parse(fs.readFileSync(tauriPath, "utf8"));
tauri.version = version;
fs.writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + "\n");

// Cargo.toml
const cargoPath = path.join(__dirname, "../apps/desktop/src-tauri/Cargo.toml");
let cargo = fs.readFileSync(cargoPath, "utf8");
cargo = cargo.replace(/^version = ".*"$/m, `version = "${version}"`);
fs.writeFileSync(cargoPath, cargo);

console.log(`Version synced to ${version}`);
