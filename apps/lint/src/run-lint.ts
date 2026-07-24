/**
 * Biome WASM boot + per-request lint/format.
 *
 * Config comes only from `APP_BIOME_CONFIG` in `@sfab-lite/core` — the same
 * object `pnpm check:app-lint` validates the seed against. Callers do not
 * pass a config; the worker owns the rules.
 */
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

const LINT_VERSIONS: LintVersions = {
  jsApi: "6.0.0",
  wasmWeb: "2.5.5",
  wranglerPin: "4.113.0",
};

let biomeReady: Biome | null = null;
let coldBootMs: number | null = null;

function ensureBiome(): { biome: Biome; coldBootMs: number } {
  if (biomeReady && coldBootMs != null) {
    return { biome: biomeReady, coldBootMs: 0 };
  }
  // Date.now(): performance.now() deltas were observed as 0 on this Worker.
  const t0 = Date.now();
  initSync({ module: biomeWasm });
  const biome = new Biome();
  coldBootMs = Date.now() - t0;
  biomeReady = biome;
  return { biome, coldBootMs };
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

export function runLint(body: LintRequest): LintResult {
  const mode: LintMode = body.mode ?? "both";
  const appId = body.appId;
  const files = body.files;
  const t0 = Date.now();
  const { biome, coldBootMs: cold } = ensureBiome();

  // Per-app project root — isolation key for concurrent / sequential calls.
  const { projectKey } = biome.openProject(`/apps/${appId}`);

  let configApplied = true;
  let configError: string | null = null;
  try {
    biome.applyConfiguration(
      projectKey,
      // JSON import widens string enums; runtime shape matches Configuration.
      APP_BIOME_CONFIG as Configuration
    );
  } catch (e) {
    configApplied = false;
    configError = e instanceof Error ? e.message : String(e);
  }

  const results: LintFileResult[] = [];
  for (const [path, content] of Object.entries(files)) {
    const ft0 = Date.now();
    let formatted: string | null = null;
    let formatChanged: boolean | null = null;
    let diagnostics: LintFileResult["diagnostics"] = [];
    let error: string | null = null;
    try {
      if (mode === "format" || mode === "both") {
        const fr = biome.formatContent(projectKey, content, { filePath: path });
        formatted = fr.content;
        formatChanged = fr.content !== content;
      }
      if (mode === "lint" || mode === "both") {
        const lr = biome.lintContent(projectKey, content, { filePath: path });
        diagnostics = (lr.diagnostics ?? []).slice(0, 20).map((d) => ({
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
      diagnosticCount: diagnostics.length,
      diagnostics,
      error,
      ms: Date.now() - ft0,
    });
  }

  return {
    ok: configApplied && results.every((r) => !r.error),
    appId,
    projectKey,
    coldBootMs: cold,
    totalMs: Date.now() - t0,
    configApplied,
    configError,
    fileCount: results.length,
    files: results,
    versions: { ...LINT_VERSIONS },
  };
}

export function bootBiome() {
  const t0 = Date.now();
  try {
    const { biome, coldBootMs: cold } = ensureBiome();
    const { projectKey } = biome.openProject("/");
    return {
      ok: true as const,
      path: "wasm-web-initSync" as const,
      bootMs: cold > 0 ? cold : Date.now() - t0,
      projectKey,
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
