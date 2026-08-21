import { readFileSync } from "node:fs";
import { validateManifest } from "@sfab-lite/core/validate-manifest";

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error("usage: proof-manifest <path-to-manifest.json>");
  process.exit(2);
}
const input = JSON.parse(readFileSync(manifestPath, "utf8"));
const result = validateManifest(input);
if (result.ok) {
  console.log(
    "MANIFEST-VALIDATE PASS:",
    JSON.stringify({
      name: result.manifest.name,
      format: result.manifest.format,
      adapter: result.manifest.adapter,
      recipes: Object.keys(result.manifest.recipes ?? {}).length,
    })
  );
} else {
  console.log("MANIFEST-VALIDATE FAIL issues:");
  for (const i of result.issues) {
    console.log(`  ${i.path}: ${i.message}`);
  }
  process.exit(1);
}
