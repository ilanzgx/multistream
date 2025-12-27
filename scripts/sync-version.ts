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

// package.json
const pkgPath = path.join(__dirname, "../package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// tauri.conf.json
const tauriPath = path.join(__dirname, "../src-tauri/tauri.conf.json");
const tauri = JSON.parse(fs.readFileSync(tauriPath, "utf8"));
tauri.version = version;
fs.writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + "\n");

// Cargo.toml
const cargoPath = path.join(__dirname, "../src-tauri/Cargo.toml");
let cargo = fs.readFileSync(cargoPath, "utf8");
cargo = cargo.replace(/^version = ".*"$/m, `version = "${version}"`);
fs.writeFileSync(cargoPath, cargo);

console.log(`Version synced to ${version}`);
