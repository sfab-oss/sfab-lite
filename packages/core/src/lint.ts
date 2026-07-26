/**
 * Shared lint-worker request/response contract.
 *
 * Owned here so `apps/lint` and (later) `apps/factory` agree on the wire
 * shape without either importing the other.
 */

export type LintMode = "lint" | "format" | "both";

export interface LintRequest {
  appId: string;
  files: Record<string, string>;
  mode?: LintMode;
}

export interface LintDiagnostic {
  category?: string;
  severity?: string;
  message: string;
}

export interface LintFileResult {
  path: string;
  formatChanged: boolean | null;
  formatted: string | null;
  /** Total diagnostics Biome produced for this file (before any cap). */
  diagnosticCount: number;
  /** True when `diagnostics` was truncated to the response cap. */
  truncated: boolean;
  diagnostics: LintDiagnostic[];
  error: string | null;
  ms: number;
}

export interface LintVersions {
  jsApi: string;
  wasmWeb: string;
}

export interface LintResult {
  ok: boolean;
  appId: string;
  coldBootMs: number;
  totalMs: number;
  fileCount: number;
  files: LintFileResult[];
  versions: LintVersions;
}

/** True when the linter ran cleanly and no error-severity diagnostics remain. */
export function lintPasses(body: LintResult | null): boolean {
  if (!body?.ok) {
    return false;
  }
  for (const file of body.files) {
    for (const d of file.diagnostics) {
      if (d.severity === "error") {
        return false;
      }
    }
  }
  return true;
}
