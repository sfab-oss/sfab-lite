#!/usr/bin/env node
/**
 * Write the four generated format files under app/ from the starter
 * manifest and the runtime pin list. Drift is gated by `pnpm check:generated`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PINS,
  UNIVERSE_EXTRA_PINS,
} from "../../../framework/runtime/scripts/pins.mjs";
import { generateFormatFiles } from "../../../framework/toolchain/src/generate-format-files.ts";
import { validateManifest } from "../../../framework/toolchain/src/validate-manifest.ts";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const appRoot = join(packageRoot, "app");
const manifest = JSON.parse(
  readFileSync(join(packageRoot, "manifest.json"), "utf8")
);
const validated = validateManifest(manifest);
if (!validated.ok) {
  console.error(
    `generate: manifest failed v0: ${validated.issues
      .map((i) => `${i.path}: ${i.message}`)
      .join("; ")}`
  );
  process.exit(1);
}

const files = generateFormatFiles(validated.manifest, {
  ...PINS,
  ...UNIVERSE_EXTRA_PINS,
});
for (const [rel, content] of Object.entries(files)) {
  writeFileSync(join(appRoot, rel), content);
}
console.log(`generate: wrote ${Object.keys(files).join(", ")}`);
