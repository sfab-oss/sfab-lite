/**
 * Immutable build store — bundles keyed by appId + sha.
 *
 * Separate from CodeHost so Git remotes and build backends can diverge
 * (e.g. Cloudflare Artifacts vs R2) behind replaceable adapters.
 *
 * AppBuild is the image: new writes must carry image v0. Reads tolerate
 * legacy records (no `image` field) by filling `image: null` so existing
 * live apps keep serving. Do not backfill — the next CD writes an image.
 */

import type { ManifestV0 } from "@sfab-lite/core";
import { validateManifest } from "@sfab-lite/core/validate-manifest";
import { z } from "zod";

export const APP_IMAGE_VERSION = 0;
export const IMAGE_SERVER_KEY = "server.js";

interface ImageV0 {
  image: typeof APP_IMAGE_VERSION;
  runtime: string;
  manifest: ManifestV0;
  server: string;
  client: string[];
  migrations: string[];
}

interface ImageLegacy {
  image: null;
  runtime: string;
  manifest: null;
  server: null;
  client: null;
  migrations: null;
}

export type AppBuild = {
  sha: string;
  serverBundle: string;
  assets: Record<string, string>;
  serverSurfaceHash: string | null;
} & (ImageV0 | ImageLegacy);

export interface BuildStore {
  putBuild: (appId: string, build: AppBuild) => Promise<void>;
  getBuild: (appId: string, sha: string) => Promise<AppBuild | null>;
}

export class ImageRequiredError extends Error {
  constructor(message = "putBuild refuses a record without image v0") {
    super(message);
    this.name = "ImageRequiredError";
  }
}

export function assertPutBuild(build: AppBuild): void {
  if (build.image !== APP_IMAGE_VERSION) {
    throw new ImageRequiredError();
  }
  if (typeof build.runtime !== "string" || build.runtime === "") {
    throw new ImageRequiredError("putBuild: runtime (resolved exact) required");
  }
  if (build.manifest == null || typeof build.manifest !== "object") {
    throw new ImageRequiredError("putBuild: manifest snapshot required");
  }
}

const stringRecordSchema = z.record(z.string(), z.string());

const storedBuildSchema = z
  .object({
    sha: z.string(),
    serverBundle: z.string(),
    assets: stringRecordSchema,
    serverSurfaceHash: z.string().nullable().optional(),
    runtime: z.string().optional(),
    kernelVersion: z.string().optional(),
    image: z.literal(APP_IMAGE_VERSION).optional(),
    manifest: z.unknown().optional(),
    server: z.string().optional(),
    client: z.array(z.string()).optional(),
    migrations: z.array(z.string()).optional(),
  })
  .passthrough();

/**
 * Normalize a stored JSON record. Legacy builds (kernelVersion, no image)
 * become image: null so serve keeps working. New writes never take this path.
 */
export function parseStoredBuild(raw: unknown): AppBuild | null {
  const parsed = storedBuildSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const record = parsed.data;
  let runtime = "";
  if (typeof record.runtime === "string" && record.runtime !== "") {
    runtime = record.runtime;
  } else if (typeof record.kernelVersion === "string") {
    runtime = record.kernelVersion;
  }
  const serverSurfaceHash =
    typeof record.serverSurfaceHash === "string"
      ? record.serverSurfaceHash
      : null;
  const base = {
    sha: record.sha,
    serverBundle: record.serverBundle,
    assets: record.assets,
    serverSurfaceHash,
    runtime,
  };
  if (record.image === APP_IMAGE_VERSION) {
    const manifest = validateManifest(record.manifest);
    if (manifest.ok) {
      const client = record.client ?? [];
      const migrations = record.migrations ?? [];
      const server =
        typeof record.server === "string" && record.server !== ""
          ? record.server
          : IMAGE_SERVER_KEY;
      return {
        ...base,
        image: APP_IMAGE_VERSION,
        manifest: manifest.manifest,
        server,
        client,
        migrations,
      };
    }
  }
  return {
    ...base,
    image: null,
    manifest: null,
    server: null,
    client: null,
    migrations: null,
  };
}

export function toAppBuild(input: {
  sha: string;
  serverBundle: string;
  assets: Record<string, string>;
  serverSurfaceHash: string | null;
  runtime: string;
  manifest: ManifestV0;
  migrations: string[];
}): AppBuild {
  return {
    sha: input.sha,
    serverBundle: input.serverBundle,
    assets: input.assets,
    serverSurfaceHash: input.serverSurfaceHash,
    image: APP_IMAGE_VERSION,
    runtime: input.runtime,
    manifest: input.manifest,
    server: IMAGE_SERVER_KEY,
    client: Object.keys(input.assets)
      .filter((key) => key !== "index.html")
      .sort(),
    migrations: input.migrations,
  };
}

export function imageServeHeaders(build: AppBuild): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Sfab-Runtime": build.runtime,
  };
  if (build.image === APP_IMAGE_VERSION) {
    headers["X-Sfab-Image"] = String(APP_IMAGE_VERSION);
  }
  return headers;
}
