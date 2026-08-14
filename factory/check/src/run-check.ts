/**
 * Per-app LanguageService cache + unit-shaped typecheck entry point.
 *
 * One check run = one worker invocation = ordered sync units (server → emit →
 * client) with LanguageService disposed between them. Two programs are never
 * live. runCheck stays synchronous: an await between construct and dispose
 * would let two programs coexist and re-OOM the isolate.
 */
import type {
  CheckDiagnostic,
  CheckRequest,
  CheckResult,
  CheckUnitName,
  CheckUnitResult,
} from "@sfab-lite/core";
import { TYPES_VFS_MANIFEST } from "@sfab-lite/kernel";
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
import {
  applyHonoOverlay,
  HONO_ACCUMULATING,
  HONO_TYPED,
} from "./hono-surface.js";
import {
  AMBIENT_ROOT_FILES,
  type AppLsState,
  createAppLsState,
  getLanguageService,
} from "./ls-host.js";
import {
  closedResolveUnresolvedMessage,
  isClientAppPath,
  sideAwareUnresolvedMessage,
} from "./resolve-modules.js";
import {
  formatHashFile,
  generatedOverlayPath,
  hashServerTree,
  overlayAppPath,
  parseHashFile,
  relFromOverlay,
  routeModules,
  serverEntryRel,
  serverImportClosure,
} from "./server-tree.js";
import {
  hashesMatch,
  snapshotFreshnessDiagnostic,
} from "./snapshot-freshness.js";
import {
  type Diagnostic,
  flattenDiagnosticMessageText,
  type LanguageService,
} from "./typescript-runtime.js";
import { normalizePath } from "./vfs.js";

/** Cap on diagnostics returned in the response (sibling of lint's cap). */
const MAX_REPORTED_DIAGNOSTICS = 40;

/** Per-isolate LS store keyed by appId. */
export type LsStore = Map<string, AppLsState>;

/** Node measure scripts sample heap while the unit's LanguageService is live. */
type AfterUnit = (unit: CheckUnitResult) => void;

const defaultStore: LsStore = new Map();
const LEADING_SLASH = /^\//;
const FRAGMENT_ENTRY = "/app/src/hono/_fragment.ts";
const GENERATED_PREFIX = "/app/src/generated/";
const TS_EXT = /\.(ts|tsx)$/;

/**
 * At most one app may hold state at a time, evicted *before* the next program
 * is built.
 *
 * A TS program over the frozen types VFS retains hundreds of MB and a Worker
 * isolate gets 128 MB. Units of one run dispose between programs so two are
 * never live; the store still holds at most one app. Making {@link runCheck}
 * async would let two programs coexist and put the isolate straight back over
 * its limit, with this cap still looking correct.
 */
function disposeService(st: AppLsState): void {
  st.service?.dispose();
  st.service = null;
  st.snapshots.clear();
  st.rootFiles = null;
}

function stateFor(appId: string, store: LsStore): AppLsState {
  for (const other of [...store.keys()]) {
    if (other !== appId) {
      const prev = store.get(other);
      if (prev) {
        disposeService(prev);
      }
      store.delete(other);
    }
  }
  let s = store.get(appId);
  if (!s) {
    s = createAppLsState();
    store.set(appId, s);
  }
  return s;
}

/** TS2307 — Cannot find module '…' or its corresponding type declarations. */
const TS_CANNOT_FIND_MODULE = 2307;
/** TS2882 — Cannot find module or type declarations for side-effect import of '…'. */
const TS_SIDE_EFFECT_IMPORT = 2882;
const MODULE_NAME_IN_DIAG =
  /(?:Cannot find module '|side-effect import of ')([^']+)'/;

function overlayPathForRel(rel: string): string {
  const path = normalizePath(`/app/${rel.replace(LEADING_SLASH, "")}`);
  if (path === "/app" || path.startsWith("/app/")) {
    return path;
  }
  return normalizePath(`/app/${path.replace(LEADING_SLASH, "")}`);
}

function mapOneDiagnostic(
  d: Diagnostic | CheckDiagnostic,
  overlay: Map<string, string>
): CheckDiagnostic {
  if ("message" in d && typeof d.message === "string") {
    return d;
  }
  const tsDiag = d as Diagnostic;
  let message = flattenDiagnosticMessageText(tsDiag.messageText, "\n");
  if (
    tsDiag.code === TS_CANNOT_FIND_MODULE ||
    tsDiag.code === TS_SIDE_EFFECT_IMPORT
  ) {
    const mod = MODULE_NAME_IN_DIAG.exec(message)?.[1];
    const sideMsg =
      mod == null
        ? undefined
        : sideAwareUnresolvedMessage(mod, tsDiag.file?.fileName, overlay);
    const closedMsg =
      mod == null
        ? undefined
        : closedResolveUnresolvedMessage(mod, tsDiag.file?.fileName);
    if (sideMsg) {
      message = sideMsg;
    } else if (closedMsg) {
      message = closedMsg;
    }
  }
  let line: number | undefined;
  let column: number | undefined;
  if (tsDiag.file && tsDiag.start != null) {
    const pos = tsDiag.file.getLineAndCharacterOfPosition(tsDiag.start);
    line = pos.line + 1;
    column = pos.character + 1;
  }
  return {
    code: tsDiag.code,
    message,
    file: tsDiag.file?.fileName,
    line,
    column,
  };
}

function summarize(
  diags: (Diagnostic | CheckDiagnostic)[],
  overlay: Map<string, string>
): CheckDiagnostic[] {
  return diags
    .map((d) => mapOneDiagnostic(d, overlay))
    .slice(0, MAX_REPORTED_DIAGNOSTICS);
}

function resetAppOverlay(st: AppLsState): void {
  disposeService(st);
  for (const k of [...st.overlay.keys()]) {
    if (k.startsWith("/app/")) {
      st.overlay.delete(k);
    }
  }
}

function bumpVersion(st: AppLsState, path: string): void {
  st.versions.set(path, (st.versions.get(path) ?? 0) + 1);
}

/** Sync `/app/*` overlay to the request file map; returns bumped paths. */
function syncOverlay(
  st: AppLsState,
  files: Record<string, string>
): { bumpedFiles: string[]; fileSetChanged: boolean } {
  const bumpedFiles: string[] = [];
  let fileSetChanged = false;
  const wanted = new Map<string, string>();

  for (const [rel, text] of Object.entries(files)) {
    if (rel === "package.json") {
      continue;
    }
    wanted.set(overlayPathForRel(rel), text);
  }

  for (const [path, text] of wanted) {
    if (!st.overlay.has(path)) {
      fileSetChanged = true;
    }
    if (st.overlay.get(path) === text) {
      continue;
    }
    st.overlay.set(path, text);
    bumpVersion(st, path);
    st.snapshots.delete(path);
    bumpedFiles.push(path);
  }

  for (const path of [...st.overlay.keys()]) {
    if (!path.startsWith("/app/")) {
      continue;
    }
    if (wanted.has(path)) {
      continue;
    }
    st.overlay.delete(path);
    st.snapshots.delete(path);
    bumpVersion(st, path);
    fileSetChanged = true;
    bumpedFiles.push(path);
  }

  return { bumpedFiles, fileSetChanged };
}

function collectDiagnostics(
  ls: LanguageService,
  appRoots: string[]
): Diagnostic[] {
  const compiler = ls.getCompilerOptionsDiagnostics();
  const syntactic = appRoots.flatMap((f) => ls.getSyntacticDiagnostics(f));
  if (syntactic.length > 0) {
    return [...compiler, ...syntactic];
  }
  const semantic = appRoots.flatMap((f) => ls.getSemanticDiagnostics(f));
  return [...compiler, ...semantic];
}

function isAppTs(path: string): boolean {
  return (
    path.startsWith("/app/src/") &&
    (path.endsWith(".ts") || path.endsWith(".tsx") || path.endsWith(".d.ts"))
  );
}

function serverUnitRoots(overlay: Map<string, string>): string[] {
  return [...overlay.keys()]
    .filter(
      (k) =>
        isAppTs(k) && !isClientAppPath(k) && !k.startsWith(GENERATED_PREFIX)
    )
    .sort();
}

function clientUnitRoots(overlay: Map<string, string>): string[] {
  const apiDts = generatedOverlayPath("apiDts");
  const roots = [...overlay.keys()]
    .filter((k) => isAppTs(k) && isClientAppPath(k))
    .sort();
  if (overlay.has(apiDts) && !roots.includes(apiDts)) {
    roots.push(apiDts);
  }
  return roots;
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

function liveServiceCount(store: LsStore): number {
  let n = 0;
  for (const st of store.values()) {
    if (st.service) {
      n += 1;
    }
  }
  return n;
}

function skippedUnit(unit: CheckUnitName): CheckUnitResult {
  return {
    unit,
    diagnosticCount: 0,
    checkMs: 0,
    rootFileCount: 0,
    skipped: true,
  };
}

type UnitRun = (
  unitRoots: string[],
  honoText: string | null
) => { diags: Diagnostic[]; checkMs: number; ls: LanguageService };

function runEmit(
  st: AppLsState,
  runUnit: UnitRun,
  entryPath: string,
  entryRel: string,
  hashed: { treeHash: string; fileHashes: Record<string, string> },
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
  hashed: { treeHash: string; fileHashes: Record<string, string> },
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
  afterUnit?.(unit);
  return { unit, emittedFiles };
}

function emitFullTree(
  st: AppLsState,
  runUnit: UnitRun,
  entryPath: string,
  hashed: { treeHash: string; fileHashes: Record<string, string> },
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
  afterUnit?.(unit);
  disposeService(st);
  applyHonoOverlay(st.overlay, st.versions, null);
  return { unit, emittedFiles };
}

/**
 * Typecheck an app as ordered units: server, emit, client-vs-snapshot.
 * `files` keys are relative like `src/hono/index.ts`.
 *
 * Each unit is synchronous. The LanguageService is disposed before the next
 * unit (and before the handler returns). CHECK_ATTEMPTS / alarm re-arm apply
 * to the run, on the host, not per unit.
 */
export function runCheck(
  body: CheckRequest,
  opts?: { store?: LsStore; afterUnit?: AfterUnit }
): CheckResult {
  const wallT0 = Date.now();
  const store = opts?.store ?? defaultStore;
  const afterUnit = opts?.afterUnit;
  const appId = body.appId;
  const files = body.files;
  const forceCold = body.forceCold === true;
  const st = stateFor(appId, store);
  const lsReused = !forceCold && st.service != null;

  if (forceCold) {
    resetAppOverlay(st);
  }

  const { bumpedFiles } = syncOverlay(st, files);
  applyHonoOverlay(st.overlay, st.versions, null);

  const entryRel = serverEntryRel(files);
  const entryPath = overlayAppPath(entryRel);
  const serverRoots = serverUnitRoots(st.overlay);
  const units: CheckUnitResult[] = [];
  const allDiags: Array<Diagnostic | CheckDiagnostic> = [];
  let checkMs = 0;
  let emittedFiles: Record<string, string> | undefined;
  let serverTreeHash: string | undefined;
  let rootFileCount = 0;

  const runUnit = (
    unitRoots: string[],
    honoText: string | null
  ): { diags: Diagnostic[]; checkMs: number; ls: LanguageService } => {
    if (st.service) {
      disposeService(st);
    }
    applyHonoOverlay(st.overlay, st.versions, honoText);
    st.rootFiles = [...unitRoots, ...AMBIENT_ROOT_FILES];
    const t0 = Date.now();
    const ls = getLanguageService(st);
    const appRoots = unitRoots.filter((f) => f.startsWith("/app/"));
    const diags = collectDiagnostics(ls, appRoots);
    return { diags, checkMs: Date.now() - t0, ls };
  };

  if (serverRoots.length > 0) {
    const server = runUnit(serverRoots, HONO_TYPED);
    checkMs += server.checkMs;
    rootFileCount += st.rootFiles?.length ?? 0;
    allDiags.push(...server.diags);
    const serverResult: CheckUnitResult = {
      unit: "server",
      diagnosticCount: server.diags.length,
      checkMs: server.checkMs,
      rootFileCount: st.rootFiles?.length ?? 0,
    };
    units.push(serverResult);
    afterUnit?.(serverResult);
    disposeService(st);
    applyHonoOverlay(st.overlay, st.versions, null);
    if (server.diags.length > 0) {
      units.push(skippedUnit("emit"), skippedUnit("client"));
      return finish(
        wallT0,
        appId,
        forceCold,
        allDiags,
        st,
        store,
        checkMs,
        rootFileCount,
        bumpedFiles,
        lsReused,
        units,
        emittedFiles,
        serverTreeHash
      );
    }
  } else {
    units.push(skippedUnit("server"));
  }

  const closure = serverImportClosure(st.overlay, entryRel);
  const hashed = hashServerTree(st.overlay, closure);
  serverTreeHash = hashed.treeHash;
  const stored = parseHashFile(st.overlay.get(generatedOverlayPath("apiHash")));
  const storedDts = st.overlay.get(generatedOverlayPath("apiDts"));
  const emit = runEmit(
    st,
    runUnit,
    entryPath,
    entryRel,
    hashed,
    stored,
    storedDts,
    afterUnit
  );
  units.push(emit.unit);
  checkMs += emit.unit.checkMs;
  rootFileCount += emit.unit.rootFileCount;
  if (emit.emittedFiles) {
    emittedFiles = emit.emittedFiles;
  }
  if (emit.error) {
    allDiags.push(emit.error);
    units.push(skippedUnit("client"));
    return finish(
      wallT0,
      appId,
      forceCold,
      allDiags,
      st,
      store,
      checkMs,
      rootFileCount,
      bumpedFiles,
      lsReused,
      units,
      emittedFiles,
      serverTreeHash
    );
  }

  const gotHash = parseHashFile(
    st.overlay.get(generatedOverlayPath("apiHash"))
  ).treeHash;
  const hasServerEntry = st.overlay.has(entryPath);
  if (
    (hasServerEntry || gotHash != null) &&
    !hashesMatch(hashed.treeHash, gotHash)
  ) {
    allDiags.push(snapshotFreshnessDiagnostic(hashed.treeHash, gotHash));
    units.push(skippedUnit("client"));
    return finish(
      wallT0,
      appId,
      forceCold,
      allDiags,
      st,
      store,
      checkMs,
      rootFileCount,
      bumpedFiles,
      lsReused,
      units,
      emittedFiles,
      serverTreeHash
    );
  }

  const clientRoots = clientUnitRoots(st.overlay);
  if (clientRoots.length === 0) {
    units.push(skippedUnit("client"));
  } else {
    const client = runUnit(clientRoots, null);
    checkMs += client.checkMs;
    rootFileCount += st.rootFiles?.length ?? 0;
    allDiags.push(...client.diags);
    const clientResult: CheckUnitResult = {
      unit: "client",
      diagnosticCount: client.diags.length,
      checkMs: client.checkMs,
      rootFileCount: st.rootFiles?.length ?? 0,
    };
    units.push(clientResult);
    afterUnit?.(clientResult);
    disposeService(st);
  }

  return finish(
    wallT0,
    appId,
    forceCold,
    allDiags,
    st,
    store,
    checkMs,
    rootFileCount,
    bumpedFiles,
    lsReused,
    units,
    emittedFiles,
    serverTreeHash
  );
}

function finish(
  wallT0: number,
  appId: string,
  forceCold: boolean,
  allDiags: (Diagnostic | CheckDiagnostic)[],
  st: AppLsState,
  store: LsStore,
  checkMs: number,
  rootFileCount: number,
  bumpedFiles: string[],
  lsReused: boolean,
  units: CheckUnitResult[],
  emittedFiles: Record<string, string> | undefined,
  serverTreeHash: string | undefined
): CheckResult {
  disposeService(st);
  applyHonoOverlay(st.overlay, st.versions, null);
  if (liveServiceCount(store) > 0) {
    throw new Error(
      `check store holds ${liveServiceCount(store)} live LanguageServices after the run`
    );
  }
  const summarized = summarize(allDiags, st.overlay);
  return {
    ok: true,
    appId,
    pass: forceCold ? "cold" : "incremental",
    diagnosticCount: allDiags.length,
    truncated: allDiags.length > MAX_REPORTED_DIAGNOSTICS,
    diagnostics: summarized,
    checkMs,
    wallMs: Date.now() - wallT0,
    rootFileCount,
    bumpedFiles,
    lsReused,
    vfsFileCount: TYPES_VFS_MANIFEST.vfsFileCount,
    emittedFiles,
    units,
    serverTreeHash,
  };
}

/** Used by the store-bound gate: a live LanguageService after runCheck is a leak. */
export function liveLanguageServices(store: LsStore): number {
  return liveServiceCount(store);
}
