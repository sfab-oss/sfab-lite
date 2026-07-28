/**
 * Per-app LanguageService cache + typecheck entry point.
 */
import type {
  CheckDiagnostic,
  CheckRequest,
  CheckResult,
} from "@sfab-lite/core";
import { TYPES_VFS_MANIFEST } from "@sfab-lite/kernel";
import {
  type AppLsState,
  createAppLsState,
  getLanguageService,
  rootsForState,
} from "./ls-host.js";
import { sideAwareUnresolvedMessage } from "./resolve-modules.js";
import {
  type Diagnostic,
  flattenDiagnosticMessageText,
} from "./typescript-runtime.js";
import { normalizePath } from "./vfs.js";

/** Cap on diagnostics returned in the response (sibling of lint's cap). */
const MAX_REPORTED_DIAGNOSTICS = 40;

/** Per-isolate LS store keyed by appId. */
export type LsStore = Map<string, AppLsState>;

const defaultStore: LsStore = new Map();
const LEADING_SLASH = /^\//;

/**
 * At most one app may hold state at a time, evicted *before* the next program
 * is built.
 *
 * A TS program over the frozen types VFS retains ~320 MB (measured by
 * `scripts/measure-memory.mjs`) and a Worker isolate gets 128 MB. The store is
 * keyed by appId and one isolate serves many apps, so an unbounded store meant
 * the second distinct app checked in an isolate built its program while the
 * first was still retained — the isolate died with `exceededMemory`. That is
 * exactly the production shape: 4 of 6 create attempts crashed and the retry
 * succeeded, because a cold isolate has nothing retained and a warm one does.
 *
 * Consecutive checks of the *same* app still reuse the LanguageService, which
 * is the case the incremental path was built for. Alternating apps now pay a
 * cold rebuild: ~1050 ms versus ~770 ms warm, the whole price of not crashing.
 *
 * Dropping the entry also resets its `versions` map, which is safe only
 * because the DocumentRegistry is owned by the LanguageService and dies with
 * it — there is no surviving cache for a reset version to collide with. Do
 * not split these two lifetimes; `regression-delete-readd-inprocess.ts` covers
 * why a stale registry entry keyed by an old version string is a real bug.
 *
 * Evicting on entry bounds *concurrent* requests too, but only because
 * {@link runCheck} is synchronous: two requests in one isolate cannot
 * interleave, so the earlier program is always unreferenced before the next is
 * built. Making `runCheck` async would let two programs coexist and put the
 * isolate straight back over its limit, with this cap still looking correct.
 */
function stateFor(appId: string, store: LsStore): AppLsState {
  for (const other of [...store.keys()]) {
    if (other !== appId) {
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
  // `..` segments escaped /app — re-root under /app so classification and
  // roots never key the overlay outside the app tree.
  return normalizePath(`/app/${path.replace(LEADING_SLASH, "")}`);
}

function summarize(
  diags: Diagnostic[],
  overlay: Map<string, string>
): CheckDiagnostic[] {
  return diags.slice(0, MAX_REPORTED_DIAGNOSTICS).map((d) => {
    let message = flattenDiagnosticMessageText(d.messageText, "\n");
    if (d.code === TS_CANNOT_FIND_MODULE || d.code === TS_SIDE_EFFECT_IMPORT) {
      const mod = MODULE_NAME_IN_DIAG.exec(message)?.[1];
      const sideMsg =
        mod == null
          ? undefined
          : sideAwareUnresolvedMessage(mod, d.file?.fileName, overlay);
      if (sideMsg) {
        message = sideMsg;
      }
    }
    let line: number | undefined;
    let column: number | undefined;
    if (d.file && d.start != null) {
      const pos = d.file.getLineAndCharacterOfPosition(d.start);
      line = pos.line + 1;
      column = pos.character + 1;
    }
    return {
      code: d.code,
      message,
      file: d.file?.fileName,
      line,
      column,
    };
  });
}

function resetAppOverlay(st: AppLsState): void {
  for (const k of [...st.overlay.keys()]) {
    if (k.startsWith("/app/")) {
      st.overlay.delete(k);
      st.snapshots.delete(k);
    }
  }
  st.rootFiles = null;
  st.service = null;
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

  // Full merged tree is always passed; drop overlay paths not in files.
  // Versions stay and bump — never restart — so a later re-add cannot reuse
  // a DocumentRegistry SourceFile keyed by the old version string.
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
  ls: ReturnType<typeof getLanguageService>,
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

/**
 * Typecheck full app sources for an appId.
 * `files` keys are relative like `src/hono/index.ts`.
 *
 * Default is **incremental** (reuse per-appId LS; bump script versions only
 * when overlay content changes). Pass `forceCold: true` to drop the LS and
 * rehydrate — used for cold baselines, not the /edit hot path.
 */
export function runCheck(
  body: CheckRequest,
  opts?: { store?: LsStore }
): CheckResult {
  const wallT0 = Date.now();
  const store = opts?.store ?? defaultStore;
  const appId = body.appId;
  const files = body.files;
  const forceCold = body.forceCold === true;
  const st = stateFor(appId, store);
  const lsReused = !forceCold && st.service != null;

  if (forceCold) {
    resetAppOverlay(st);
  }

  const { bumpedFiles, fileSetChanged } = syncOverlay(st, files);
  if (fileSetChanged) {
    st.rootFiles = null;
  }

  const roots = rootsForState(st);
  // Collect diagnostics on /app sources only (libs stay in the program via
  // getScriptFileNames; skipLibCheck — no per-call lib fan-out).
  const appRoots = roots.filter((f) => f.startsWith("/app/"));
  // Date.now(): performance.now() deltas were observed as 0 on Workers (lint).
  const t0 = Date.now();
  const ls = getLanguageService(st);
  const diags = collectDiagnostics(ls, appRoots);
  const checkMs = Date.now() - t0;

  return {
    ok: true,
    appId,
    pass: forceCold ? "cold" : "incremental",
    diagnosticCount: diags.length,
    truncated: diags.length > MAX_REPORTED_DIAGNOSTICS,
    diagnostics: summarize(diags, st.overlay),
    checkMs,
    wallMs: Date.now() - wallT0,
    rootFileCount: roots.length,
    bumpedFiles,
    lsReused,
    vfsFileCount: TYPES_VFS_MANIFEST.vfsFileCount,
  };
}
