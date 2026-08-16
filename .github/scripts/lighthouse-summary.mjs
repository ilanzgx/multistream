import fs from "fs";
import path from "path";

const dir = ".lighthouseci";

if (!fs.existsSync(dir)) {
  process.exit(0);
}

const files = fs.readdirSync(dir).filter((f) => f.startsWith("lhr-") && f.endsWith(".json"));

if (!files.length) {
  process.exit(0);
}

function getScore(lhr, category) {
  const score = lhr.categories?.[category]?.score;
  if (score == null) return "N/A";
  const pct = Math.round(score * 100);
  if (pct >= 90) return "🟢 " + pct;
  if (pct >= 50) return "🟡 " + pct;
  return "🔴 " + pct;
}

const parsedReports = files.map((file) => {
  return JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
});

const hasSeo = parsedReports.some((lhr) => lhr.categories?.seo != null);

let md = "## 🔦 Lighthouse Audit Results\n\n";
if (hasSeo) {
  md += "| Page | Performance | Accessibility | Best Practices | SEO |\n";
  md += "|------|:-----------:|:-------------:|:--------------:|:---:|\n";
} else {
  md += "| Page | Performance | Accessibility | Best Practices |\n";
  md += "|------|:-----------:|:-------------:|:--------------:|\n";
}

parsedReports.forEach((lhr) => {
  const rawUrl = lhr.finalDisplayedUrl || lhr.requestedUrl;
  const pagePath = new URL(rawUrl).pathname;

  const perf = getScore(lhr, "performance");
  const a11y = getScore(lhr, "accessibility");
  const bp = getScore(lhr, "best-practices");

  if (hasSeo) {
    const seo = getScore(lhr, "seo");
    md += "| `" + pagePath + "` | " + perf + " | " + a11y + " | " + bp + " | " + seo + " |\n";
  } else {
    md += "| `" + pagePath + "` | " + perf + " | " + a11y + " | " + bp + " |\n";
  }
});

console.log("\n--- Generated Markdown ---");
console.log(md);
console.log("--- End Markdown ---\n");

const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
  fs.writeFileSync(summaryFile, md);
}
