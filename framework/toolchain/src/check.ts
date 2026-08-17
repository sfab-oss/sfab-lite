/**
 * Shared check-worker request/response contract.
 *
 * Owned here so `factory/check` and (later) `factory` agree on the wire
 * shape without either importing the other. Sibling of `LintResult`.
 */

import { z } from "zod";
import { appIdSchema, filesSchema, parseRequest } from "./request.js";
import { requestManifestSchema } from "./validate-manifest.js";

export type CheckUnitName = "server" | "emit" | "client";

export const checkRequestSchema = z.object({
  appId: appIdSchema,
  files: filesSchema,
  manifest: requestManifestSchema,
  forceCold: z.boolean({ error: "body.forceCold must be boolean" }).optional(),
});

/** Parsed app-format v0 of the tree being checked — never the starter's. */
export type CheckRequest = z.infer<typeof checkRequestSchema>;

export function parseCheckRequest(value: unknown): CheckRequest {
  return parseRequest(checkRequestSchema, value);
}

export interface CheckUnitResult {
  unit: CheckUnitName;
  diagnosticCount: number;
  checkMs: number;
  rootFileCount: number;
  /** True when the unit did not construct a program (server failed, skip, …). */
  skipped?: boolean;
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

/**
 * A check that ran. `ok` is fixed `true` and says only that — the verdict on
 * the code is `diagnosticCount`, and {@link checkPasses} is the one place that
 * reads it as a verdict.
 *
 * `ok` used to mean `diagnosticCount === 0`, which is not what it means on
 * `LintResult`, where it reports whether the worker itself managed to answer.
 * A renderer written for both shapes therefore swallowed every type error the
 * agent shell ever produced.
 */
export interface CheckResult {
  ok: true;
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
  /**
   * Snapshot files produced by the emit unit (`src/generated/api.d.ts` +
   * `api.hash`). The host persists these onto the app tree after the run;
   * the check worker has no storage bindings.
   */
  emittedFiles?: Record<string, string>;
  /** Per-unit timings and diagnostic counts, in run order. */
  units?: CheckUnitResult[];
  /** `sha256:` of the server-tree import closure this run hashed. */
  serverTreeHash?: string;
}

/** A check that could not run. Carries no diagnostics — nothing was checked. */
export interface CheckFailure {
  ok: false;
  error: string;
}

/**
 * What `POST /check` answers with. Discriminating on `ok` is what stops a
 * caller from reporting "no errors" for a worker that never checked anything.
 */
export type CheckResponse = CheckResult | CheckFailure;
