import { readFileSync } from "node:fs";
import { runLint } from "@sfab-lite/verbs/lint";

const seedPath = process.argv[2];
if (!seedPath) {
  console.error("usage: proof-lint <path-to-seed.json>");
  process.exit(2);
}
const seed = JSON.parse(readFileSync(seedPath, "utf8")) as {
  sourceFiles: Record<string, string>;
};

const result = runLint({
  appId: "verb-independence",
  files: seed.sourceFiles,
  mode: "both",
});

console.log(
  "LINT RESULT:",
  JSON.stringify({
    ok: result.ok,
    fileCount: result.fileCount,
    errorCount: result.errorCount,
    warningCount: result.warningCount,
    coldBootMs: result.coldBootMs,
    totalMs: result.totalMs,
    versions: result.versions,
  })
);
const bad = result.files.filter((f) => f.error || f.errorCount > 0);
for (const f of bad.slice(0, 10)) {
  console.log(
    `  ${f.path}: errors=${f.errorCount} err=${f.error ?? ""} ${f.diagnostics
      .slice(0, 3)
      .map((d) => `${d.category}:${d.message}`)
      .join(" | ")}`
  );
}
process.exit(result.ok && result.errorCount === 0 ? 0 : 1);
