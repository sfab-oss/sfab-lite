/**
 * Shared lint-worker request/response contract.
 *
 * Owned here so `factory/lint` and (later) `factory` agree on the wire
 * shape without either importing the other.
 */

import { z } from "zod";
import { appIdSchema, filesSchema, parseRequest } from "./request.js";

export const lintRequestSchema = z.object({
  appId: appIdSchema,
  files: filesSchema,
  mode: z
    .enum(["lint", "format", "both"], {
      error: "body.mode must be lint, format, or both",
    })
    .optional(),
});

export type LintRequest = z.infer<typeof lintRequestSchema>;
export type LintMode = NonNullable<LintRequest["mode"]>;

export function parseLintRequest(value: unknown): LintRequest {
  return parseRequest(lintRequestSchema, value);
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
