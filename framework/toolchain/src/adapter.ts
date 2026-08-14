/**
 * Serve-adapter shape. Framework-owned; apps name a target in the
 * manifest and never implement this. Cloudflare is the only v0 target.
 *
 * See `docs/architecture/APP-FORMAT.md` §6.
 */

import type { AdapterTarget, ManifestV0 } from "./manifest.js";

export interface SqliteDriver {
  readonly kind: "sqlite";
}

export interface BlobStore {
  readonly kind: "blob";
}

export interface SecretsSource {
  readonly kind: "secrets";
}

export interface PackOutput {
  server: string;
  client: string[];
  html: string;
  migrations: string[];
}

export interface AppImage {
  image: 0;
  sha: string;
  runtime: string;
  manifest: ManifestV0;
  server: string;
  client: string[];
  migrations: string[];
}

export interface ServeAdapter {
  readonly target: AdapterTarget;
  pack: (image: AppImage) => Promise<PackOutput>;
  bindings: () => {
    db: SqliteDriver;
    storage: BlobStore;
    secrets: SecretsSource;
  };
}
