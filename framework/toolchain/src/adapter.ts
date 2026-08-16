/**
 * Serve-adapter shape. Framework-owned; apps name a target in the
 * manifest and never implement this. Cloudflare is the only v0 target.
 *
 * The app never sees a driver: `generateFormatFiles` emits `src/db/index.ts`
 * (`createDb` / `Db`) for the named target. Cloudflare: `drizzle-orm/d1`
 * over `env.DB`. See `docs/architecture/APP-FORMAT.md` §6 and ADR-0014.
 */

import type { AdapterTarget, ManifestV0 } from "./manifest.js";

export interface SqliteDriver {
  readonly dialect: "sqlite";
}

export type BlobStore = import("./storage.js").Storage;

export type SecretsSource = object;

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
    storage?: BlobStore;
    secrets: SecretsSource;
  };
}
