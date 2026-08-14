/**
 * Is the right check unit the agent's edit, not the whole app?
 *
 *   node scripts/measure-entities.mjs
 *
 * Same overlay-all / seed-roots harness as measure-split / measure-zones.
 * Local heap is an indicator, never a production claim.
 */

import { TYPES_VFS } from "@sfab-lite/kernel";
import seed from "@sfab-lite/template/seed" with { type: "json" };
import { createAppLsState, getLanguageService } from "../src/ls-host.ts";

const SERVER_ENTITIES = "/app/src/hono/org-protected/entities.ts";
const CLIENT_ENTITIES = "/app/src/ui/routes/entities.tsx";
const HOOK_ENTITIES = "/app/src/ui/hooks/use-entities.ts";
const CONTRACT_ENTITIES = "/app/src/contract/entities.ts";

const AMBIENT_ROOTS: string[] = [
  "/types/cloudflare-ambient.d.ts",
  ...Object.keys(TYPES_VFS)
    .filter((k) => k.startsWith("/libs/lib.") && k.endsWith(".d.ts"))
    .sort(),
];

const files: Record<string, string> = {};
for (const [path, text] of Object.entries(
  seed.sourceFiles as Record<string, string>
)) {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) {
    files[`/app/${path}`] = text;
  }
}

const allAppFiles = Object.keys(files).sort();

function heapMb(): number {
  global.gc?.();
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed / 1_048_576;
}

function overlayOf() {
  const st = createAppLsState();
  for (const [p, text] of Object.entries(files)) {
    st.overlay.set(p, text);
    st.versions.set(p, 1);
  }
  return st;
}

function measure(label: string, programRoots: string[], diagRoots: string[]) {
  const before = heapMb();
  const st = overlayOf();
  st.rootFiles = [...programRoots, ...AMBIENT_ROOTS];
  const ls = getLanguageService(st);

  const t0 = Date.now();
  let diagnostics = 0;
  for (const r of diagRoots) {
    diagnostics += ls.getSemanticDiagnostics(r).length;
  }
  const ms = Date.now() - t0;

  const p = ls.getProgram();
  const sfs = p ? p.getSourceFiles() : [];
  const bytes = sfs.reduce((n, s) => n + s.text.length, 0);
  const after = heapMb();
  const row = {
    label,
    programRoots: programRoots.length,
    diagRoots: diagRoots.length,
    loadedFiles: sfs.length,
    loadedTextMb: Number((bytes / 1_048_576).toFixed(2)),
    diagnostics,
    ms,
    heapRetainedMb: Number((after - before).toFixed(0)),
  };
  console.log(JSON.stringify(row));
  return row;
}

measure("union (today)", allAppFiles, allAppFiles);
measure(
  "entities server, import closure",
  [SERVER_ENTITIES],
  [SERVER_ENTITIES]
);
measure(
  "entities client route, import closure",
  [CLIENT_ENTITIES],
  [CLIENT_ENTITIES]
);
measure("entities hook, import closure", [HOOK_ENTITIES], [HOOK_ENTITIES]);
measure(
  "entities contract, import closure",
  [CONTRACT_ENTITIES],
  [CONTRACT_ENTITIES]
);
measure("union program, diagnostics only entities.ts", allAppFiles, [
  SERVER_ENTITIES,
]);
measure("union program, diagnostics only contract/entities.ts", allAppFiles, [
  CONTRACT_ENTITIES,
]);
