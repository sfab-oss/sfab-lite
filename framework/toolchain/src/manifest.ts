/**
 * App-format v0: typed manifest + generated-artifact paths.
 *
 * The RFC is `docs/architecture/APP-FORMAT.md`. This module is the
 * schema that RFC names — data only, no I/O.
 */

export const MANIFEST_FORMAT = 0;

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
 * Fixed paths — apps do not choose them. Emit/drift land in later PRs;
 * the format names the members now.
 */
export const GENERATED_ARTIFACTS = {
  packageJson: "package.json",
  tsconfig: "tsconfig.json",
  indexHtml: "index.html",
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
