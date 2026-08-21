import { readFileSync } from "node:fs";
import type { ManifestV0 } from "@sfab-lite/core";
import { runCheck } from "@sfab-lite/verbs/check";

const seedPath = process.argv[2];
if (!seedPath) {
  console.error("usage: proof-check <path-to-seed.json>");
  process.exit(2);
}
const seed = JSON.parse(readFileSync(seedPath, "utf8")) as {
  manifest: ManifestV0;
  sourceFiles: Record<string, string>;
};

const files: Record<string, string> = {};
for (const [path, text] of Object.entries(seed.sourceFiles)) {
  if (
    path.endsWith(".ts") ||
    path.endsWith(".tsx") ||
    path.endsWith(".css") ||
    path.endsWith(".d.ts") ||
    path.endsWith(".hash")
  ) {
    files[path] = text;
  }
}

const result = runCheck({
  appId: "verb-independence",
  files,
  manifest: seed.manifest,
  forceCold: true,
});

console.log(
  "CHECK RESULT:",
  JSON.stringify({
    pass: result.pass,
    diagnosticCount: result.diagnosticCount,
    units: result.units,
    checkMs: result.checkMs,
    rootFileCount: result.rootFileCount,
    vfsFileCount: result.vfsFileCount,
    emittedFiles: Object.keys(result.emittedFiles ?? {}),
    serverTreeHash: result.serverTreeHash,
  })
);
for (const d of result.diagnostics.slice(0, 15)) {
  console.log(`  ${d.file}:${d.line ?? "?"} [${d.code}] ${d.message}`);
}
process.exit(result.diagnosticCount === 0 ? 0 : 1);
