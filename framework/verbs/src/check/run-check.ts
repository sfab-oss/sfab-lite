/**
 * Per-app LanguageService cache + unit-shaped typecheck entry point.
 *
 * One check run = one worker invocation = ordered sync units (server → emit →
 * client, then `modules` when catalog boundary files are present) with
 * LanguageService disposed between them. Two programs are never live. runCheck
 * stays synchronous: an await between construct and dispose would let two
 * programs coexist and re-OOM the isolate.
 */
import type {
  CheckDiagnostic,
  CheckRequest,
  CheckResult,
  CheckUnitResult,
} from "@sfab-lite/core";
import { realModuleTypesForOverlay } from "@sfab-lite/core/catalog-real-vfs";
import { TYPES_VFS_MANIFEST } from "@sfab-lite/kernel";
import { catalogExportLeakageDiagnostics } from "./catalog-export-leak.js";
import {
  clientPrefixesFromManifest,
  isClientAppPath,
} from "./client-prefixes.js";
import {
  type AfterUnit,
  runEmit,
  skippedUnit,
  type UnitRun,
} from "./emit-units.js";
import { applyHonoOverlay, HONO_TYPED } from "./hono-surface.js";
import {
  AMBIENT_ROOT_FILES,
  type AppLsState,
  createAppLsState,
  disposeService,
  getLanguageService,
} from "./ls-host.js";
import {
  closedResolveUnresolvedMessage,
  sideAwareUnresolvedMessage,
} from "./resolve-modules.js";
import {
  generatedOverlayPath,
  hashServerTree,
  overlayAppPath,
  parseHashFile,
  serverEntryRel,
  serverImportClosure,
} from "./server-tree.js";
import {
  hashesMatch,
  snapshotFreshnessDiagnostic,
} from "./snapshot-freshness.js";
import {
  diagnosticRelatedPaths,
  rewriteSurfaceDiagnostic,
} from "./surface-diagnostic.js";
import { transactionFloorDiagnostics } from "./transaction-floor.js";
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

const defaultStore: LsStore = new Map();
const LEADING_SLASH = /^\//;
const GENERATED_PREFIX = "/app/src/generated/";

/**
 * At most one app may hold state at a time, evicted *before* the next program
 * is built (see {@link disposeService} for the memory invariant).
 */
function stateFor(
  appId: string,
  store: LsStore,
  clientPrefixes: readonly string[]
): AppLsState {
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
  if (s) {
    s.clientPrefixes = clientPrefixes;
  } else {
    s = createAppLsState(clientPrefixes);
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
  overlay: Map<string, string>,
  clientPrefixes: readonly string[],
  catalogOverlayKeys: ReadonlySet<string>
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
        : sideAwareUnresolvedMessage(
            mod,
            tsDiag.file?.fileName,
            overlay,
            clientPrefixes
          );
    const closedMsg =
      mod == null
        ? undefined
        : closedResolveUnresolvedMessage(
            mod,
            tsDiag.file?.fileName,
            clientPrefixes,
            overlay
          );
    if (sideMsg) {
      message = sideMsg;
    } else if (closedMsg) {
      message = closedMsg;
    }
  }
  const surfaceMsg = rewriteSurfaceDiagnostic({
    code: tsDiag.code,
    message,
    usageFile: tsDiag.file?.fileName,
    relatedPaths: diagnosticRelatedPaths(tsDiag),
    catalogOverlayKeys,
    overlay,
    isClientUsage: isClientAppPath(tsDiag.file?.fileName, clientPrefixes),
  });
  if (surfaceMsg != null) {
    message = surfaceMsg;
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
  overlay: Map<string, string>,
  clientPrefixes: readonly string[],
  catalogOverlayKeys: ReadonlySet<string>
): CheckDiagnostic[] {
  return diags
    .map((d) =>
      mapOneDiagnostic(d, overlay, clientPrefixes, catalogOverlayKeys)
    )
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

/**
 * Overlay catalog-module stubs onto the VFS for this run. Keys live under
 * `/node_modules/` so they survive `resetAppOverlay` (which only clears
 * `/app/*`) and must be stripped before the handler returns — otherwise the
 * next run on this isolate would inherit them.
 */
function applyModuleTypesOverlay(
  st: AppLsState,
  moduleTypes: Record<string, string> | undefined
): string[] {
  if (moduleTypes == null) {
    return [];
  }
  const keys: string[] = [];
  for (const [rawPath, text] of Object.entries(moduleTypes)) {
    const path = normalizePath(rawPath);
    if (!path.startsWith("/node_modules/")) {
      continue;
    }
    st.overlay.set(path, text);
    bumpVersion(st, path);
    st.snapshots.delete(path);
    keys.push(path);
  }
  return keys;
}

function stripModuleTypesOverlay(st: AppLsState, keys: string[]): void {
  for (const path of keys) {
    st.overlay.delete(path);
    st.snapshots.delete(path);
    bumpVersion(st, path);
  }
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

function serverUnitRoots(
  overlay: Map<string, string>,
  clientPrefixes: readonly string[]
): string[] {
  return [...overlay.keys()]
    .filter(
      (k) =>
        isAppTs(k) &&
        !isClientAppPath(k, clientPrefixes) &&
        !k.startsWith(GENERATED_PREFIX)
    )
    .sort();
}

function clientUnitRoots(
  overlay: Map<string, string>,
  clientPrefixes: readonly string[]
): string[] {
  const apiDts = generatedOverlayPath("apiDts");
  const roots = [...overlay.keys()]
    .filter((k) => isAppTs(k) && isClientAppPath(k, clientPrefixes))
    .sort();
  if (overlay.has(apiDts) && !roots.includes(apiDts)) {
    roots.push(apiDts);
  }
  return roots;
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

/** Everything a run accumulates, built once and closed by {@link finish}. */
interface RunCtx {
  wallT0: number;
  appId: string;
  forceCold: boolean;
  st: AppLsState;
  store: LsStore;
  bumpedFiles: string[];
  lsReused: boolean;
  units: CheckUnitResult[];
  allDiags: Array<Diagnostic | CheckDiagnostic>;
  checkMs: number;
  rootFileCount: number;
  emittedFiles?: Record<string, string>;
  serverTreeHash?: string;
  catalogOverlayKeys: ReadonlySet<string>;
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
  const store = opts?.store ?? defaultStore;
  const afterUnit = opts?.afterUnit;
  const forceCold = body.forceCold === true;
  const clientPrefixes = clientPrefixesFromManifest(body.manifest);
  const st = stateFor(body.appId, store, clientPrefixes);
  const ctx: RunCtx = {
    wallT0: Date.now(),
    appId: body.appId,
    forceCold,
    st,
    store,
    bumpedFiles: [],
    lsReused: !forceCold && st.service != null,
    units: [],
    allDiags: [],
    checkMs: 0,
    rootFileCount: 0,
    catalogOverlayKeys: new Set(),
  };

  if (forceCold) {
    resetAppOverlay(st);
  }

  ctx.bumpedFiles = syncOverlay(st, body.files).bumpedFiles;
  const overlayKeys = applyModuleTypesOverlay(st, body.moduleTypes);
  ctx.catalogOverlayKeys = new Set(overlayKeys);
  try {
    return runUnits(ctx, body, afterUnit);
  } finally {
    stripModuleTypesOverlay(st, overlayKeys);
  }
}

function runUnits(
  ctx: RunCtx,
  body: CheckRequest,
  afterUnit: AfterUnit | undefined
): CheckResult {
  const { st } = ctx;
  const clientPrefixes = st.clientPrefixes;
  applyHonoOverlay(st.overlay, st.versions, null);
  ctx.allDiags.push(...transactionFloorDiagnostics(body.files));
  ctx.allDiags.push(...catalogExportLeakageDiagnostics(body.files));

  const entryRel = serverEntryRel(body.manifest);
  const entryPath = overlayAppPath(entryRel);
  const serverRoots = serverUnitRoots(st.overlay, clientPrefixes);

  const runUnit: UnitRun = (unitRoots, honoText) => {
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
    ctx.checkMs += server.checkMs;
    ctx.rootFileCount += st.rootFiles?.length ?? 0;
    ctx.allDiags.push(...server.diags);
    const serverResult: CheckUnitResult = {
      unit: "server",
      diagnosticCount: server.diags.length,
      checkMs: server.checkMs,
      rootFileCount: st.rootFiles?.length ?? 0,
    };
    ctx.units.push(serverResult);
    afterUnit?.(serverResult, st.overlay);
    disposeService(st);
    applyHonoOverlay(st.overlay, st.versions, null);
    if (server.diags.length > 0) {
      ctx.units.push(skippedUnit("emit"), skippedUnit("client"));
      return complete(ctx, body, runUnit, afterUnit);
    }
  } else {
    ctx.units.push(skippedUnit("server"));
  }

  const closure = serverImportClosure(st.overlay, entryRel);
  const hashed = hashServerTree(st.overlay, closure);
  ctx.serverTreeHash = hashed.treeHash;
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
  ctx.units.push(emit.unit);
  ctx.checkMs += emit.unit.checkMs;
  ctx.rootFileCount += emit.unit.rootFileCount;
  if (emit.emittedFiles) {
    ctx.emittedFiles = emit.emittedFiles;
  }
  if (emit.error) {
    ctx.allDiags.push(emit.error);
    ctx.units.push(skippedUnit("client"));
    return complete(ctx, body, runUnit, afterUnit);
  }

  const gotHash = parseHashFile(
    st.overlay.get(generatedOverlayPath("apiHash"))
  ).treeHash;
  const hasServerEntry = st.overlay.has(entryPath);
  if (
    (hasServerEntry || gotHash != null) &&
    !hashesMatch(hashed.treeHash, gotHash)
  ) {
    ctx.allDiags.push(snapshotFreshnessDiagnostic(hashed.treeHash, gotHash));
    ctx.units.push(skippedUnit("client"));
    return complete(ctx, body, runUnit, afterUnit);
  }

  const clientRoots = clientUnitRoots(st.overlay, clientPrefixes);
  if (clientRoots.length === 0) {
    ctx.units.push(skippedUnit("client"));
  } else {
    const client = runUnit(clientRoots, null);
    ctx.checkMs += client.checkMs;
    ctx.rootFileCount += st.rootFiles?.length ?? 0;
    ctx.allDiags.push(...client.diags);
    const clientResult: CheckUnitResult = {
      unit: "client",
      diagnosticCount: client.diags.length,
      checkMs: client.checkMs,
      rootFileCount: st.rootFiles?.length ?? 0,
    };
    ctx.units.push(clientResult);
    afterUnit?.(clientResult, st.overlay);
    disposeService(st);
  }

  return complete(ctx, body, runUnit, afterUnit);
}

function runBoundaryUnit(
  ctx: RunCtx,
  body: CheckRequest,
  runUnit: UnitRun,
  afterUnit: AfterUnit | undefined
): void {
  const planned = realModuleTypesForOverlay(ctx.st.overlay);
  if (planned.roots.length === 0) {
    return;
  }
  const types = body.boundaryModuleTypes ?? planned.types;
  if (Object.keys(types).length === 0) {
    throw new Error("catalog boundary files present but real vfs is empty");
  }
  disposeService(ctx.st);
  applyHonoOverlay(ctx.st.overlay, ctx.st.versions, null);
  const realKeys = applyModuleTypesOverlay(ctx.st, types);
  try {
    const extra = runUnit(planned.roots, null);
    ctx.checkMs += extra.checkMs;
    ctx.rootFileCount += ctx.st.rootFiles?.length ?? 0;
    ctx.allDiags.push(...extra.diags);
    const extraResult: CheckUnitResult = {
      unit: "modules",
      diagnosticCount: extra.diags.length,
      checkMs: extra.checkMs,
      rootFileCount: ctx.st.rootFiles?.length ?? 0,
    };
    ctx.units.push(extraResult);
    afterUnit?.(extraResult, ctx.st.overlay);
    disposeService(ctx.st);
  } finally {
    stripModuleTypesOverlay(ctx.st, realKeys);
    // Summarize rewrites LITE-SURFACE / LITE-RESOLVE from cheap overlay text.
    applyModuleTypesOverlay(ctx.st, body.moduleTypes);
  }
}

function complete(
  ctx: RunCtx,
  body: CheckRequest,
  runUnit: UnitRun,
  afterUnit: AfterUnit | undefined
): CheckResult {
  runBoundaryUnit(ctx, body, runUnit, afterUnit);
  return finish(ctx);
}

function finish(ctx: RunCtx): CheckResult {
  disposeService(ctx.st);
  applyHonoOverlay(ctx.st.overlay, ctx.st.versions, null);
  if (liveServiceCount(ctx.store) > 0) {
    throw new Error(
      `check store holds ${liveServiceCount(ctx.store)} live LanguageServices after the run`
    );
  }
  const summarized = summarize(
    ctx.allDiags,
    ctx.st.overlay,
    ctx.st.clientPrefixes,
    ctx.catalogOverlayKeys
  );
  return {
    ok: true,
    appId: ctx.appId,
    pass: ctx.forceCold ? "cold" : "incremental",
    diagnosticCount: ctx.allDiags.length,
    truncated: ctx.allDiags.length > MAX_REPORTED_DIAGNOSTICS,
    diagnostics: summarized,
    checkMs: ctx.checkMs,
    wallMs: Date.now() - ctx.wallT0,
    rootFileCount: ctx.rootFileCount,
    bumpedFiles: ctx.bumpedFiles,
    lsReused: ctx.lsReused,
    vfsFileCount: TYPES_VFS_MANIFEST.vfsFileCount,
    emittedFiles: ctx.emittedFiles,
    units: ctx.units,
    serverTreeHash: ctx.serverTreeHash,
  };
}

/** Used by the store-bound gate: a live LanguageService after runCheck is a leak. */
export function liveLanguageServices(store: LsStore): number {
  return liveServiceCount(store);
}
