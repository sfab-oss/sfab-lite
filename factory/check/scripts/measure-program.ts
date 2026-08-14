/**
 * What does the check worker's TS program actually load?
 *
 * The types VFS has 2,043 files, but only the transitive closure of the app's
 * imports gets parsed into SourceFiles — and it is parsing, not the VFS string
 * constants, that dominates the heap. Pruning files the program never opens
 * would shrink the bundle and change nothing about the 128 MB problem, so this
 * reports loaded files by package before any trimming decision is made.
 *
 * Bundled by the companion .mjs runner so Node can load workspace TS.
 */

import { TYPES_VFS } from "@sfab-lite/kernel";
import seed from "@sfab-lite/template/seed" with { type: "json" };
import {
  createAppLsState,
  getLanguageService,
  rootsForState,
} from "../src/ls-host.ts";

const files: Record<string, string> = {};
for (const [path, text] of Object.entries(
  seed.sourceFiles as Record<string, string>
)) {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) {
    files[path] = text;
  }
}

const st = createAppLsState();
for (const [rel, text] of Object.entries(files)) {
  st.overlay.set(`/app/${rel}`, text);
  st.versions.set(`/app/${rel}`, 1);
}

const ls = getLanguageService(st);
const roots = rootsForState(st).filter((f) => f.startsWith("/app/"));
// Force the full semantic pass, which is what pulls the closure in.
for (const f of roots) {
  ls.getSemanticDiagnostics(f);
}

const program = ls.getProgram();
if (!program) {
  console.error("no program");
  process.exit(1);
}

function bucket(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "libs") {
    return "libs";
  }
  if (parts[0] === "app") {
    return "app";
  }
  if (parts[0] === "node_modules") {
    return parts[1]?.startsWith("@") ? `${parts[1]}/${parts[2]}` : parts[1];
  }
  return parts[0];
}

const loaded = new Map<string, { files: number; bytes: number }>();
let totalFiles = 0;
let totalBytes = 0;
const loadedPaths = new Set<string>();

for (const sf of program.getSourceFiles()) {
  const key = bucket(sf.fileName);
  const n = sf.text.length;
  const cur = loaded.get(key) ?? { files: 0, bytes: 0 };
  cur.files++;
  cur.bytes += n;
  loaded.set(key, cur);
  totalFiles++;
  totalBytes += n;
  loadedPaths.add(sf.fileName);
}

console.log(
  `program: ${totalFiles} source files, ${(totalBytes / 1_048_576).toFixed(2)} MB of text`
);
console.log(
  `VFS:     ${Object.keys(TYPES_VFS).length} files — ${Object.keys(TYPES_VFS).filter((k) => !loadedPaths.has(k)).length} never opened\n`
);
console.log("loaded, by package:");
for (const [k, v] of [...loaded].sort((a, b) => b[1].bytes - a[1].bytes)) {
  const inVfs = Object.keys(TYPES_VFS).filter((p) => bucket(p) === k).length;
  console.log(
    `${(v.bytes / 1_048_576).toFixed(2).padStart(7)} MB ${String(v.files).padStart(5)} loaded / ${String(inVfs).padStart(5)} in VFS  ${k}`
  );
}
