/**
 * App-format v0: typed manifest + generated-artifact paths.
 *
 * The RFC is `docs/architecture/APP-FORMAT.md`. This module is the
 * schema that RFC names — data only, no I/O.
 */

export const MANIFEST_FORMAT = 0;

/** Provenance keys and recipe names: `lite/<slug>` only. Bare names fail. */
export const RECIPE_NAME_RE =
  /^lite\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

export const SHA256_RE = /^sha256:[a-f0-9]{64}$/;

export const EXACT_VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export type AdapterTarget = "cloudflare";

export const ADAPTER_TARGETS = [
  "cloudflare",
] as const satisfies readonly AdapterTarget[];

/** Host overwrites these; agents do not edit them. */
export const HOST_AUTHORITATIVE_FIELDS = [
  "format",
  "runtime",
  "recipes",
] as const;

/**
 * Fixed paths — apps do not choose them. Root files are emitted by
 * `generateFormatFiles` and drift-gated by `check:generated`. Snapshot
 * files are the check emit unit.
 */
export const GENERATED_ARTIFACTS = {
  packageJson: "package.json",
  tsconfig: "tsconfig.json",
  indexHtml: "index.html",
  componentsJson: "components.json",
  apiDts: "src/generated/api.d.ts",
  apiHash: "src/generated/api.hash",
} as const;

export interface ManifestServer {
  entry: string;
  exportName: string;
}

export interface ManifestClient {
  entry: string;
  styles: string;
}

export interface ManifestSource {
  dirs: string[];
  extensions: string[];
  files: string[];
  exclude: string[];
}

export interface RecipeProvenance {
  version: string;
  files: Record<string, string>;
}

export interface ManifestModule {
  name: string;
  version: string;
}

export interface ManifestV0 {
  format: typeof MANIFEST_FORMAT;
  name: string;
  runtime: string;
  adapter: AdapterTarget;
  root: string;
  server: ManifestServer;
  client: ManifestClient;
  html: string;
  safelist: string;
  migrations: string;
  schema: string;
  inject: Record<string, string>;
  source: ManifestSource;
  capabilities: string[];
  modules: ManifestModule[];
  recipes: Record<string, RecipeProvenance>;
}
