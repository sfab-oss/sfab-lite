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
import {
  type Diagnostic,
  flattenDiagnosticMessageText,
} from "./typescript-runtime.js";

/** Per-isolate LS store keyed by appId. */
export type LsStore = Map<string, AppLsState>;

const defaultStore: LsStore = new Map();
const LEADING_SLASH = /^\//;

function stateFor(appId: string, store: LsStore): AppLsState {
  let s = store.get(appId);
  if (!s) {
    s = createAppLsState();
    store.set(appId, s);
  }
  return s;
}

function summarize(diags: Diagnostic[]): CheckDiagnostic[] {
  return diags.slice(0, 40).map((d) => ({
    code: d.code,
    message: flattenDiagnosticMessageText(d.messageText, "\n"),
    file: d.file?.fileName,
  }));
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

/** Sync `/app/*` overlay to the request file map; returns bumped paths. */
function syncOverlay(
  st: AppLsState,
  files: Record<string, string>
): { bumpedFiles: string[]; fileSetChanged: boolean } {
  const bumpedFiles: string[] = [];
  let fileSetChanged = false;

  for (const [rel, text] of Object.entries(files)) {
    if (rel === "package.json") {
      continue;
    }
    const path = `/app/${rel.replace(LEADING_SLASH, "")}`;
    if (!st.overlay.has(path)) {
      fileSetChanged = true;
    }
    if (st.overlay.get(path) === text) {
      continue;
    }
    st.overlay.set(path, text);
    st.versions.set(path, (st.versions.get(path) ?? 0) + 1);
    st.snapshots.delete(path);
    bumpedFiles.push(path);
  }

  // Full merged tree is always passed; drop overlay paths not in files.
  for (const path of [...st.overlay.keys()]) {
    if (!path.startsWith("/app/")) {
      continue;
    }
    const rel = path.slice("/app/".length);
    if (rel in files) {
      continue;
    }
    st.overlay.delete(path);
    st.snapshots.delete(path);
    st.versions.delete(path);
    fileSetChanged = true;
    bumpedFiles.push(path);
  }

  return { bumpedFiles, fileSetChanged };
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
  const diags = [
    ...ls.getCompilerOptionsDiagnostics(),
    ...appRoots.flatMap((f) => ls.getSemanticDiagnostics(f)),
    ...appRoots.flatMap((f) => ls.getSyntacticDiagnostics(f)),
  ];
  const checkMs = Date.now() - t0;
  const clean = diags.length === 0;

  return {
    ok: clean,
    appId,
    pass: forceCold ? "cold" : "incremental",
    diagnosticCount: diags.length,
    diagnostics: summarize(diags),
    checkMs,
    wallMs: Date.now() - wallT0,
    rootFileCount: roots.length,
    clean,
    bumpedFiles,
    lsReused,
    vfsFileCount: TYPES_VFS_MANIFEST.vfsFileCount,
  };
}
