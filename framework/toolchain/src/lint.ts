/**
 * Shared lint-worker request/response contract.
 *
 * Owned here so `factory/lint` and (later) `factory` agree on the wire
 * shape without either importing the other.
 */

import {
  InvalidRequestError,
  parseAppIdField,
  parseFilesField,
  requestFields,
} from "./request.js";

export type LintMode = "lint" | "format" | "both";

export interface LintRequest {
  appId: string;
  files: Record<string, string>;
  mode?: LintMode;
}

export function parseLintRequest(value: unknown): LintRequest {
  const body = requestFields(value);
  const files = parseFilesField(body.files);
  const appId = parseAppIdField(body.appId);
  const parsed: LintRequest = { appId, files };
  if (body.mode === undefined) {
    return parsed;
  }
  if (!isLintMode(body.mode)) {
    throw new InvalidRequestError(
      "mode",
      "body.mode must be lint, format, or both"
    );
  }
  parsed.mode = body.mode;
  return parsed;
}

function isLintMode(value: unknown): value is LintMode {
  return value === "lint" || value === "format" || value === "both";
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
  /** Error-severity count for this file (uncapped; used by the commit gate). */
  errorCount: number;
  /** Warning-severity count for this file (uncapped). */
  warningCount: number;
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
  /** Error-severity count across all files (uncapped; used by the commit gate). */
  errorCount: number;
  /** Warning-severity count across all files (uncapped). */
  warningCount: number;
  files: LintFileResult[];
  versions: LintVersions;
}

/** True when the linter ran cleanly and no error-severity diagnostics remain. */
export function lintPasses(body: LintResult | null): boolean {
  if (!body?.ok) {
    return false;
  }
  // Gate on uncapped counts — `diagnostics` may be truncated for payload size.
  return body.errorCount === 0;
}
