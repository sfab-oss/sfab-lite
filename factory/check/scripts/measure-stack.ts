/**
 * Stack typed drizzle+Hono check types with shallow RPC on the union and
 * the entities page. Does the whole-app program fit locally?
 *
 *   node scripts/run-measure.mjs measure-stack.ts
 *
 * Union roots are `/app/src/**` (what the check worker seeds), not
 * vite.config.ts. Local heap is an indicator.
 */

import { TYPES_VFS } from "@sfab-lite/kernel";
import seed from "@sfab-lite/template/seed" with { type: "json" };
import type ts from "typescript";
import { createAppLsState, getLanguageService } from "../src/ls-host.ts";
import {
  applyShallow,
  DRIZZLE_TYPED,
  HONO_TYPED,
} from "./experiment-overlays.ts";

const CLIENT_ENTITIES = "/app/src/ui/routes/entities.tsx";

const AMBIENT_ROOTS: string[] = [
  "/types/cloudflare-ambient.d.ts",
  ...Object.keys(TYPES_VFS)
    .filter((k) => k.startsWith("/libs/lib.") && k.endsWith(".d.ts"))
    .sort(),
];

const DRIZZLE = "/node_modules/drizzle-orm";
const HONO = "/node_modules/hono";

const files: Record<string, string> = {};
for (const [path, text] of Object.entries(
  seed.sourceFiles as Record<string, string>
)) {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) {
    files[`/app/${path}`] = text;
  }
}

const unionRoots = Object.keys(files)
  .filter(
    (p) =>
      p.startsWith("/app/src/") && (p.endsWith(".ts") || p.endsWith(".tsx"))
  )
  .sort();

const shallowFiles = applyShallow(files);

function heapMb(): number {
  global.gc?.();
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed / 1_048_576;
}

function matchesPrefix(key: string, prefix: string): boolean {
  return key === prefix || key.startsWith(`${prefix}/`);
}

function overlayTypedVendors(
  overlay: Map<string, string>,
  versions: Map<string, number>
): number {
  let n = 0;
  for (const key of Object.keys(TYPES_VFS)) {
    let text: string | undefined;
    if (matchesPrefix(key, DRIZZLE)) {
      text = DRIZZLE_TYPED;
    } else if (matchesPrefix(key, HONO)) {
      text = HONO_TYPED;
    }
    if (text) {
      overlay.set(key, text);
      versions.set(key, 1);
      n += 1;
    }
  }
  return n;
}

function diagSummary(diags: readonly ts.Diagnostic[]): string[] {
  return diags.slice(0, 6).map((d) => {
    const msg =
      typeof d.messageText === "string"
        ? d.messageText
        : d.messageText.messageText;
    return `TS${d.code}: ${msg}`;
  });
}

function measure(
  label: string,
  programRoots: string[],
  src: Record<string, string>,
  typedVendors: boolean
) {
  const before = heapMb();
  const st = createAppLsState();
  for (const [p, text] of Object.entries(src)) {
    st.overlay.set(p, text);
    st.versions.set(p, 1);
  }
  const stubbedFiles = typedVendors
    ? overlayTypedVendors(st.overlay, st.versions)
    : 0;
  st.rootFiles = [...programRoots, ...AMBIENT_ROOTS];
  const ls = getLanguageService(st);

  const t0 = Date.now();
  const allDiags: ts.Diagnostic[] = [];
  for (const r of programRoots) {
    allDiags.push(...ls.getSemanticDiagnostics(r));
  }
  const ms = Date.now() - t0;

  const p = ls.getProgram();
  const sfs = p ? p.getSourceFiles() : [];
  const bytes = sfs.reduce((n, s) => n + s.text.length, 0);
  const after = heapMb();
  const row = {
    label,
    programRoots: programRoots.length,
    stubbedFiles,
    loadedFiles: sfs.length,
    honoFiles: sfs.filter((s) => s.fileName.includes("/node_modules/hono/"))
      .length,
    drizzleFiles: sfs.filter((s) =>
      s.fileName.includes("/node_modules/drizzle-orm/")
    ).length,
    loadedTextMb: Number((bytes / 1_048_576).toFixed(2)),
    diagnostics: allDiags.length,
    diagnosticSample: diagSummary(allDiags),
    ms,
    heapRetainedMb: Number((after - before).toFixed(0)),
  };
  console.log(JSON.stringify(row));
  return row;
}

measure("union (today)", unionRoots, files, false);
measure("union, typed drizzle+hono", unionRoots, files, true);
measure("union, shallow RPC", unionRoots, shallowFiles, false);
measure("union, stacked", unionRoots, shallowFiles, true);
measure("entities page (today)", [CLIENT_ENTITIES], files, false);
measure("entities page, typed drizzle+hono", [CLIENT_ENTITIES], files, true);
measure("entities page, shallow RPC", [CLIENT_ENTITIES], shallowFiles, false);
measure("entities page, stacked", [CLIENT_ENTITIES], shallowFiles, true);
