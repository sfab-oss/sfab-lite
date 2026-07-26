#!/usr/bin/env node
/**
 * Fail if `apps/factory/src/agent/vendor/bash-tool.ts` drifts from the bash
 * section in the installed `@cloudflare/think` source map.
 *
 * Think's `createBashTool` does not pass `customCommands` into `Bash`, and the
 * snapshot/sync helpers are not exported — so we vendor that section with a
 * two-line delta. Silent upstream drift is the real risk; this gate re-extracts
 * and compares (same shape as `check:seed` / `check:kernel`).
 */
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const vendoredPath = join(
  repoRoot,
  "apps/factory/src/agent/vendor/bash-tool.ts"
);
const BEGIN = "// --- BEGIN VENDORED ---";
const END = "// --- END VENDORED ---";

const thinkRoot = realpathSync(
  join(repoRoot, "apps/factory/node_modules/@cloudflare/think")
);
const mapPath = join(thinkRoot, "dist/tools/workspace.js.map");

const map = JSON.parse(readFileSync(mapPath, "utf8"));
const source = map.sourcesContent?.[0];
if (typeof source !== "string") {
  console.error(
    "check:vendored-bash — @cloudflare/think workspace.js.map has no sourcesContent."
  );
  process.exit(1);
}

const lines = source.split("\n");
const startIdx = lines.findIndex((l) => l.startsWith("const DEFAULT_BASH_"));
const endIdx = lines.findIndex(
  (l, i) => i > startIdx && l.startsWith("function errorMessage(")
);
if (startIdx < 0 || endIdx < 0) {
  console.error(
    "check:vendored-bash — could not locate DEFAULT_BASH_* … errorMessage in upstream source."
  );
  process.exit(1);
}
// Include the full errorMessage function body through its closing brace line.
let closeIdx = endIdx;
for (let i = endIdx; i < lines.length; i++) {
  if (lines[i] === "}") {
    closeIdx = i;
    break;
  }
}
let upstream = `${lines.slice(startIdx, closeIdx + 1).join("\n")}\n`;

const oldOpts = `export interface BashToolOptions {
  ops: BashOperations;
  timeout?: number;
  network?: boolean;
  maxWorkspaceFiles?: number;
  maxWorkspaceFileBytes?: number;
  maxOutputBytes?: number;
}`;
const newOpts = `export interface BashToolOptions {
  ops: BashOperations;
  timeout?: number;
  network?: boolean;
  maxWorkspaceFiles?: number;
  maxWorkspaceFileBytes?: number;
  maxOutputBytes?: number;
  customCommands?: CustomCommand[];
}`;
const oldBash = `      const bash = new Bash({
        files: snapshot.files,
        cwd: normalizeWorkspacePath(cwd ?? "/"),
        defenseInDepth: true,
        network: options.network ? {} : undefined
      });`;
const newBash = `      const bash = new Bash({
        files: snapshot.files,
        cwd: normalizeWorkspacePath(cwd ?? "/"),
        defenseInDepth: true,
        network: options.network ? {} : undefined,
        customCommands: options.customCommands
      });`;

if (!(upstream.includes(oldOpts) && upstream.includes(oldBash))) {
  console.error(
    "check:vendored-bash — upstream bash section no longer matches the expected baseline.\n" +
      "  Re-vendor from @cloudflare/think and re-apply the customCommands delta."
  );
  process.exit(1);
}
upstream = upstream.replace(oldOpts, newOpts).replace(oldBash, newBash);

const vendored = readFileSync(vendoredPath, "utf8");
const beginAt = vendored.indexOf(BEGIN);
const endAt = vendored.indexOf(END);
if (beginAt < 0 || endAt < 0 || endAt <= beginAt) {
  console.error(
    "check:vendored-bash — vendored file missing BEGIN/END VENDORED markers."
  );
  process.exit(1);
}
const ours = `${vendored.slice(beginAt + BEGIN.length, endAt).replace(/^\n/, "")}`;

if (ours === upstream) {
  const n = upstream.trimEnd().split("\n").length;
  console.log(
    `check:vendored-bash — ok (${n} lines; customCommands delta only vs @cloudflare/think)`
  );
  process.exit(0);
}

console.error(
  "check:vendored-bash — apps/factory/src/agent/vendor/bash-tool.ts drifted from upstream."
);
console.error(
  "  Expected the vendored section to match the source-map extract plus the two-line customCommands delta."
);
console.error(
  "  Fix: re-extract from @cloudflare/think dist/tools/workspace.js.map and re-apply the delta."
);
process.exit(1);
