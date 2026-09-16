const args = process.argv.slice(2);

const hasNextest = (() => {
  try {
    const check = Bun.spawnSync({
      cmd: ["cargo", "nextest", "--version"],
      stdout: "ignore",
      stderr: "ignore",
    });
    return check.exitCode === 0;
  } catch {
    return false;
  }
})();

if (hasNextest) {
  const proc = Bun.spawnSync({
    cmd: [
      "cargo",
      "nextest",
      "run",
      "--manifest-path",
      "apps/desktop/src-tauri/Cargo.toml",
      ...args,
    ],
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  process.exit(proc.exitCode);
} else {
  console.log(
    "ℹ️  cargo-nextest not found. Falling back to standard cargo test...\n" +
      "💡 Tip: Install cargo-nextest for ~10x faster tests: https://nexte.st/book/installation.html\n"
  );
  const proc = Bun.spawnSync({
    cmd: ["cargo", "test", "--manifest-path", "apps/desktop/src-tauri/Cargo.toml", ...args],
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  process.exit(proc.exitCode);
}
