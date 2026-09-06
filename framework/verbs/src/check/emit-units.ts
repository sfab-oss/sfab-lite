/**
 * Emit-unit orchestration: decide skip / warm leaf prefix-merge / cold
 * full-tree, run the accumulating-Hono program(s), and write the snapshot
 * pair into the overlay + the outgoing `emittedFiles`.
 *
 * Units stay synchronous; the caller's `runUnit` disposes the previous
 * LanguageService before constructing the next one, and every path here
 * disposes before returning (including the failure path).
 */
import type {
  CheckDiagnostic,
  CheckUnitName,
  CheckUnitResult,
} from "@sfab-lite/core";
import {
  extractSchemaText,
  fragmentSource,
  generateApiDts,
  parseSchemaEntries,
  prefixMergeSchema,
  printSchemaEntries,
  wrapApiDts,
} from "./emit-snapshot.js";
import { API_DTS, API_HASH } from "./generated-paths.js";
import { applyHonoOverlay, HONO_ACCUMULATING } from "./hono-surface.js";
import { type AppLsState, disposeService } from "./ls-host.js";
import {
  formatHashFile,
  generatedOverlayPath,
  type parseHashFile,
  relFromOverlay,
  routeModules,
  serverImportClosure,
} from "./server-tree.js";
import { hashesMatch } from "./snapshot-freshness.js";
import type { Diagnostic, LanguageService } from "./typescript-runtime.js";

const FRAGMENT_ENTRY = "/app/src/hono/_fragment.ts";
const TS_EXT = /\.(ts|tsx)$/;

/** Node measure scripts sample heap while the unit's LanguageService is live. */
export type AfterUnit = (
  unit: CheckUnitResult,
  overlay: ReadonlyMap<string, string>
) => void;

export type UnitRun = (
  unitRoots: string[],
  honoText: string | null
) => { diags: Diagnostic[]; checkMs: number; ls: LanguageService };

export interface HashedServerTree {
  treeHash: string;
  fileHashes: Record<string, string>;
}

export function skippedUnit(unit: CheckUnitName): CheckUnitResult {
  return {
    unit,
    diagnosticCount: 0,
    checkMs: 0,
    rootFileCount: 0,
    skipped: true,
  };
}

function relativeModuleSpec(fromFile: string, toFile: string): string {
  const fromDir = fromFile
    .slice(0, fromFile.lastIndexOf("/"))
    .split("/")
    .filter(Boolean);
  const toParts = toFile.replace(TS_EXT, "").split("/").filter(Boolean);
  let i = 0;
  while (
    i < fromDir.length &&
    i < toParts.length - 1 &&
    fromDir[i] === toParts[i]
  ) {
    i += 1;
  }
  const ups = fromDir.length - i;
  const down = toParts.slice(i).join("/");
  const spec = `${"../".repeat(ups)}${down}`;
  return spec.startsWith(".") ? spec : `./${spec}`;
}

function bumpVersion(st: AppLsState, path: string): void {
  st.versions.set(path, (st.versions.get(path) ?? 0) + 1);
}

function writeGenerated(
  st: AppLsState,
  dts: string,
  hashFile: string
): Record<string, string> {
  const dtsPath = generatedOverlayPath("apiDts");
  const hashPath = generatedOverlayPath("apiHash");
  st.overlay.set(dtsPath, dts);
  st.overlay.set(hashPath, hashFile);
  bumpVersion(st, dtsPath);
  bumpVersion(st, hashPath);
  st.snapshots.delete(dtsPath);
  st.snapshots.delete(hashPath);
  return {
    [API_DTS]: dts,
    [API_HASH]: hashFile,
  };
}

export function runEmit(
  st: AppLsState,
  runUnit: UnitRun,
  entryPath: string,
  entryRel: string,
  hashed: HashedServerTree,
  stored: ReturnType<typeof parseHashFile>,
  storedDts: string | undefined,
  afterUnit?: AfterUnit
): {
  unit: CheckUnitResult;
  emittedFiles?: Record<string, string>;
  error?: CheckDiagnostic;
} {
  const snapshotFresh = hashesMatch(hashed.treeHash, stored.treeHash);
  if (
    !st.overlay.has(entryPath) ||
    (snapshotFresh && storedDts != null && storedDts !== "")
  ) {
    return { unit: skippedUnit("emit") };
  }
  const modules = routeModules(st.overlay, entryRel);
  const leaves = modules.filter((m) => m.isLeaf);
  const changedRels: string[] = [];
  const closure = serverImportClosure(st.overlay, entryRel);
  for (const path of closure) {
    const rel = relFromOverlay(path);
    if (hashed.fileHashes[rel] !== stored.fileHashes[rel]) {
      changedRels.push(rel);
    }
  }
  const canWarm =
    stored.treeHash != null &&
    storedDts != null &&
    changedRels.length > 0 &&
    changedRels.every((rel) => leaves.some((leaf) => leaf.rel === rel));
  try {
    if (canWarm && storedDts != null) {
      return emitWarmLeaves(
        st,
        runUnit,
        hashed,
        storedDts,
        leaves,
        changedRels,
        afterUnit
      );
    }
    return emitFullTree(st, runUnit, entryPath, hashed, afterUnit);
  } catch (e) {
    disposeService(st);
    applyHonoOverlay(st.overlay, st.versions, null);
    return {
      unit: {
        unit: "emit",
        diagnosticCount: 1,
        checkMs: 0,
        rootFileCount: 0,
      },
      error: {
        code: 9002,
        message: `LITE-SNAPSHOT: emit failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
        file: entryPath,
      },
    };
  }
}

function emitWarmLeaves(
  st: AppLsState,
  runUnit: UnitRun,
  hashed: HashedServerTree,
  storedDts: string,
  leaves: ReturnType<typeof routeModules>,
  changedRels: string[],
  afterUnit?: AfterUnit
): {
  unit: CheckUnitResult;
  emittedFiles: Record<string, string>;
} {
  const baseSchema = parseSchemaEntries(extractSchemaText(storedDts) ?? "{}");
  let merged = new Map(baseSchema);
  let emitMs = 0;
  let emitRoots = 0;
  for (const rel of changedRels) {
    const leaf = leaves.find((l) => l.rel === rel);
    if (!leaf) {
      continue;
    }
    const spec = relativeModuleSpec(FRAGMENT_ENTRY, leaf.overlayPath);
    st.overlay.set(FRAGMENT_ENTRY, fragmentSource(leaf.exportName, spec));
    bumpVersion(st, FRAGMENT_ENTRY);
    const frag = runUnit([FRAGMENT_ENTRY], HONO_ACCUMULATING);
    emitMs += frag.checkMs;
    emitRoots += st.rootFiles?.length ?? 0;
    const dts = generateApiDts(frag.ls, FRAGMENT_ENTRY);
    merged = prefixMergeSchema(
      merged,
      leaf.prefix,
      parseSchemaEntries(dts.schemaText)
    );
    disposeService(st);
    st.overlay.delete(FRAGMENT_ENTRY);
  }
  applyHonoOverlay(st.overlay, st.versions, null);
  const hashFile = formatHashFile(hashed.treeHash, hashed.fileHashes);
  const emittedFiles = writeGenerated(
    st,
    wrapApiDts(printSchemaEntries(merged)),
    hashFile
  );
  const unit: CheckUnitResult = {
    unit: "emit",
    diagnosticCount: 0,
    checkMs: emitMs,
    rootFileCount: emitRoots,
  };
  afterUnit?.(unit, st.overlay);
  return { unit, emittedFiles };
}

function emitFullTree(
  st: AppLsState,
  runUnit: UnitRun,
  entryPath: string,
  hashed: HashedServerTree,
  afterUnit?: AfterUnit
): {
  unit: CheckUnitResult;
  emittedFiles: Record<string, string>;
} {
  const emit = runUnit([entryPath], HONO_ACCUMULATING);
  const dts = generateApiDts(emit.ls, entryPath);
  const hashFile = formatHashFile(hashed.treeHash, hashed.fileHashes);
  const emittedFiles = writeGenerated(st, dts.text, hashFile);
  const unit: CheckUnitResult = {
    unit: "emit",
    diagnosticCount: emit.diags.length,
    checkMs: emit.checkMs,
    rootFileCount: st.rootFiles?.length ?? 0,
  };
  afterUnit?.(unit, st.overlay);
  disposeService(st);
  applyHonoOverlay(st.overlay, st.versions, null);
  return { unit, emittedFiles };
}
