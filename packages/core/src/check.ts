/**
 * Shared check-worker request/response contract.
 *
 * Owned here so `apps/check` and (later) `apps/factory` agree on the wire
 * shape without either importing the other. Sibling of `LintResult`.
 */

export interface CheckRequest {
  appId: string;
  files: Record<string, string>;
  /** Drop the per-app LanguageService and rehydrate from scratch. */
  forceCold?: boolean;
}

export interface CheckDiagnostic {
  code: number;
  message: string;
  file?: string;
  /** 1-based line, when the diagnostic has a SourceFile position. */
  line?: number;
  /** 1-based column, when the diagnostic has a SourceFile position. */
  column?: number;
}

export interface CheckResult {
  ok: boolean;
  appId: string;
  pass: "cold" | "incremental";
  /** Total diagnostics produced (before any response cap). */
  diagnosticCount: number;
  /** True when `diagnostics` was truncated to the response cap. */
  truncated: boolean;
  diagnostics: CheckDiagnostic[];
  checkMs: number;
  wallMs: number;
  rootFileCount: number;
  /** Paths whose script version bumped (content changed). Empty on pure reuse. */
  bumpedFiles: string[];
  /** True when the per-appId LanguageService instance was kept. */
  lsReused: boolean;
  vfsFileCount: number;
}
