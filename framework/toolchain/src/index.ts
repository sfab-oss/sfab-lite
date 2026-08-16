/**
 * @sfab-lite/core — shared contracts: app/version types, D1 ambient surface,
 * check/lint results, app-format manifest v0, tasks-lite model.
 *
 * Filled in stage by stage. Today it holds the two pieces the template port
 * needed to have a single owner: the app-facing Biome config, and the
 * Cloudflare ambient surface (`cloudflare-ambient.d.ts`, referenced by
 * tsconfig rather than imported) — plus the lint/check wire contracts and
 * `mergeSources` consumed by workers and (later) the factory host.
 */

export type {
  AppImage,
  BlobStore,
  PackOutput,
  SecretsSource,
  ServeAdapter,
  SqliteDriver,
} from "./adapter.js";
export { APP_BIOME_CONFIG } from "./app-biome-config.js";
export type {
  CheckDiagnostic,
  CheckFailure,
  CheckRequest,
  CheckResponse,
  CheckResult,
  CheckUnitName,
  CheckUnitResult,
} from "./check.js";
export type { FormatPins } from "./generate-format-files.js";
export {
  formatIndexHtml,
  generateFormatFiles,
} from "./generate-format-files.js";
export type {
  LintDiagnostic,
  LintFileResult,
  LintMode,
  LintRequest,
  LintResult,
  LintVersions,
} from "./lint.js";
export { lintPasses } from "./lint.js";
export type {
  AdapterTarget,
  ManifestCapability,
  ManifestClient,
  ManifestModule,
  ManifestServer,
  ManifestSource,
  ManifestV0,
  RecipeProvenance,
} from "./manifest.js";
export {
  ADAPTER_TARGETS,
  EXACT_VERSION_RE,
  GENERATED_ARTIFACTS,
  HOST_AUTHORITATIVE_FIELDS,
  MANIFEST_CAPABILITIES,
  MANIFEST_FORMAT,
  RECIPE_NAME_RE,
  SHA256_RE,
} from "./manifest.js";
export { mergeSources } from "./merge-sources.js";
export type {
  Storage,
  StorageHead,
  StorageListItem,
  StorageListResult,
  StorageObject,
  StoragePutOptions,
} from "./storage.js";
export type { ManifestIssue, ManifestValidation } from "./validate-manifest.js";
export { validateManifest } from "./validate-manifest.js";
