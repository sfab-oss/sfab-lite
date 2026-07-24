/**
 * @sfab-lite/core — shared contracts: app/version types, ScopedSql,
 * check/lint results, tasks-lite model.
 *
 * Filled in stage by stage. Today it holds the two pieces the template port
 * needed to have a single owner: the app-facing Biome config, and the
 * Cloudflare ambient surface (`cloudflare-ambient.d.ts`, referenced by
 * tsconfig rather than imported) — plus the lint/check wire contracts and
 * `mergeSources` consumed by workers and (later) the factory host.
 */
export { APP_BIOME_CONFIG } from "./app-biome-config.js";
export type {
  CheckDiagnostic,
  CheckRequest,
  CheckResult,
} from "./check.js";
export type {
  LintDiagnostic,
  LintFileResult,
  LintMode,
  LintRequest,
  LintResult,
  LintVersions,
} from "./lint.js";
export { mergeSources } from "./merge-sources.js";
