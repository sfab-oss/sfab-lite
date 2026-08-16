/**
 * Biome WASM boot + per-request lint/format.
 *
 * One Biome project is opened at cold boot with `APP_BIOME_CONFIG` applied
 * once. Per-request work only passes `filePath` into lint/format — there is
 * no per-app project (and no `closeProject` in `@biomejs/js-api@6` to reclaim
 * one anyway). Response `path` values are the request keys, not Biome roots.
 */
/// <reference path="./wasm.d.ts" />
import { Biome, type Configuration } from "@biomejs/js-api/web";
import { initSync } from "@biomejs/wasm-web";
import biomeWasm from "@biomejs/wasm-web/biome_wasm_bg.wasm";
import {
  APP_BIOME_CONFIG,
  type LintFileResult,
  type LintMode,
  type LintRequest,
  type LintResult,
  type LintVersions,
} from "@sfab-lite/core";
import pkg from "../../package.json" with { type: "json" };

const MAX_REPORTED_DIAGNOSTICS = 20;

const LINT_VERSIONS: LintVersions = {
  jsApi: pkg.dependencies["@biomejs/js-api"],
  wasmWeb: pkg.dependencies["@biomejs/wasm-web"],
};

interface BiomeSession {
  biome: Biome;
  projectKey: number;
}

let session: BiomeSession | null = null;
let coldBootMs: number | null = null;

function ensureBiome(): { session: BiomeSession; coldBootMs: number } {
  if (session && coldBootMs != null) {
    return { session, coldBootMs: 0 };
  }
  // Date.now(): performance.now() deltas were observed as 0 on this Worker.
  const t0 = Date.now();
  initSync({ module: biomeWasm });
  const biome = new Biome();
  const { projectKey } = biome.openProject("/");
  // JSON import widens string enums; runtime shape matches Configuration.
  biome.applyConfiguration(projectKey, APP_BIOME_CONFIG as Configuration);
  coldBootMs = Date.now() - t0;
  session = { biome, projectKey };
  return { session, coldBootMs };
}

function diagnosticMessage(d: { message?: unknown }): string {
  if (typeof d.message === "string") {
    return d.message;
  }
  // Biome WASM often returns rich text as [{ content, elements }, ...].
  if (Array.isArray(d.message)) {
    return d.message
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (
          part &&
          typeof part === "object" &&
          "content" in part &&
          typeof (part as { content: unknown }).content === "string"
        ) {
          return (part as { content: string }).content;
        }
        return "";
      })
      .join("");
  }
  try {
    return JSON.stringify(d.message)?.slice(0, 200) ?? "";
  } catch {
    return String(d.message);
  }
}

function countSeverities(diagnostics: { severity?: string }[]): {
  errorCount: number;
  warningCount: number;
} {
  let errorCount = 0;
  let warningCount = 0;
  for (const d of diagnostics) {
    if (d.severity === "error") {
      errorCount++;
    } else if (d.severity === "warning") {
      warningCount++;
    }
  }
  return { errorCount, warningCount };
}

/**
 * Extensions Biome can actually handle.
 *
 * An app's `sourceFiles` is the whole workspace, which now includes
 * `migrations/*.sql`. Biome has no SQL analyzer, so handing it one throws,
 * and a throw here sets `error` on the file, which drops `ok` to false and
 * fails the publish gate. Filtering is what keeps a perfectly good migration
 * from reading as a lint failure.
 */
const LINTABLE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".jsonc",
  ".css",
];

function isLintable(path: string): boolean {
  return LINTABLE_EXTENSIONS.some((ext) => path.endsWith(ext));
}

export function runLint(body: LintRequest): LintResult {
  const mode: LintMode = body.mode ?? "both";
  const appId = body.appId;
  const files = body.files;
  const t0 = Date.now();
  const {
    session: { biome, projectKey },
    coldBootMs: cold,
  } = ensureBiome();

  const results: LintFileResult[] = [];
  for (const [path, content] of Object.entries(files)) {
    if (!isLintable(path)) {
      continue;
    }
    const ft0 = Date.now();
    let formatted: string | null = null;
    let formatChanged: boolean | null = null;
    let diagnostics: LintFileResult["diagnostics"] = [];
    let diagnosticCount = 0;
    let errorCount = 0;
    let warningCount = 0;
    let truncated = false;
    let error: string | null = null;
    try {
      if (mode === "format" || mode === "both") {
        const fr = biome.formatContent(projectKey, content, { filePath: path });
        formatted = fr.content;
        formatChanged = fr.content !== content;
      }
      if (mode === "lint" || mode === "both") {
        const lr = biome.lintContent(projectKey, content, { filePath: path });
        const all = lr.diagnostics ?? [];
        diagnosticCount = all.length;
        const counts = countSeverities(all);
        errorCount = counts.errorCount;
        warningCount = counts.warningCount;
        truncated = diagnosticCount > MAX_REPORTED_DIAGNOSTICS;
        diagnostics = all.slice(0, MAX_REPORTED_DIAGNOSTICS).map((d) => ({
          category: d.category,
          severity: d.severity,
          message: diagnosticMessage(d),
        }));
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    results.push({
      path,
      formatChanged,
      formatted,
      diagnosticCount,
      errorCount,
      warningCount,
      truncated,
      diagnostics,
      error,
      ms: Date.now() - ft0,
    });
  }

  const errorCount = results.reduce((n, r) => n + r.errorCount, 0);
  const warningCount = results.reduce((n, r) => n + r.warningCount, 0);

  return {
    ok: results.every((r) => !r.error),
    appId,
    coldBootMs: cold,
    totalMs: Date.now() - t0,
    fileCount: results.length,
    errorCount,
    warningCount,
    files: results,
    versions: { ...LINT_VERSIONS },
  };
}

export function bootBiome() {
  const t0 = Date.now();
  try {
    const { coldBootMs: cold } = ensureBiome();
    return {
      ok: true as const,
      path: "wasm-web-initSync" as const,
      bootMs: cold > 0 ? cold : Date.now() - t0,
      versions: { ...LINT_VERSIONS },
    };
  } catch (e) {
    return {
      ok: false as const,
      path: "wasm-web-initSync" as const,
      bootMs: Date.now() - t0,
      versions: { ...LINT_VERSIONS },
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    };
  }
}
