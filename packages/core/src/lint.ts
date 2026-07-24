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
  diagnosticCount: number;
  diagnostics: LintDiagnostic[];
  error: string | null;
  ms: number;
}

export interface LintVersions {
  jsApi: string;
  wasmWeb: string;
  wranglerPin: string;
}

export interface LintResult {
  ok: boolean;
  appId: string;
  projectKey: number;
  coldBootMs: number;
  totalMs: number;
  configApplied: boolean;
  configError: string | null;
  fileCount: number;
  files: LintFileResult[];
  versions: LintVersions;
}
