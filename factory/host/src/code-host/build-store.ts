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

function asStringRecord(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") {
      return null;
    }
    out[key] = entry;
  }
  return out;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      return null;
    }
    out.push(entry);
  }
  return out;
}

/**
 * Normalize a stored JSON record. Legacy builds (kernelVersion, no image)
 * become image: null so serve keeps working. New writes never take this path.
 */
export function parseStoredBuild(raw: unknown): AppBuild | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (
    typeof record.sha !== "string" ||
    typeof record.serverBundle !== "string"
  ) {
    return null;
  }
  const assets = asStringRecord(record.assets);
  if (!assets) {
    return null;
  }
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
    assets,
    serverSurfaceHash,
    runtime,
  };
  if (
    record.image === APP_IMAGE_VERSION &&
    record.manifest &&
    typeof record.manifest === "object"
  ) {
    const client = asStringArray(record.client) ?? [];
    const migrations = asStringArray(record.migrations) ?? [];
    const server =
      typeof record.server === "string" && record.server !== ""
        ? record.server
        : IMAGE_SERVER_KEY;
    return {
      ...base,
      image: APP_IMAGE_VERSION,
      manifest: record.manifest as ManifestV0,
      server,
      client,
      migrations,
    };
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
