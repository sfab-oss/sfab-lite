import seed from "@sfab-lite/template/seed" with { type: "json" };
import { runCheck } from "../src/run-check.ts";

const files: Record<string, string> = {};
for (const [path, text] of Object.entries(
  seed.sourceFiles as Record<string, string>
)) {
  if (path.endsWith(".ts") || path.endsWith(".tsx") || path.endsWith(".css")) {
    files[path] = text;
  }
}

const result = runCheck({ appId: "dump", files });
console.log("diagnosticCount", result.diagnosticCount);
const byFile = new Map<string, number>();
for (const d of result.diagnostics) {
  const f = d.file ?? "(nofile)";
  byFile.set(f, (byFile.get(f) ?? 0) + 1);
}
console.log(
  "byFile",
  [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
);
const byMsg = new Map<string, number>();
for (const d of result.diagnostics) {
  const k = `${d.code}: ${d.message}`;
  byMsg.set(k, (byMsg.get(k) ?? 0) + 1);
}
console.log("top messages:");
for (const [k, n] of [...byMsg.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 25)) {
  console.log(n, k);
}
console.log("samples:");
for (const d of result.diagnostics.slice(0, 20)) {
  console.log(`${d.file}:${d.line ?? "?"} [${d.code}] ${d.message}`);
}
