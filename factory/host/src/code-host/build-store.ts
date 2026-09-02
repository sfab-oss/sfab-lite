/**
 * Immutable build store — bundles keyed by appId + sha.
 *
 * Separate from CodeHost so Git remotes and build backends can diverge
 * behind replaceable adapters. Cloudflare Artifacts is the vendor git
 * product; this store is still R2. Product nouns stay code host / repo /
 * build / forge.
 *
 * AppBuild is the image: writes and reads require image v0. Pre-cutover
 * records fail closed (parse returns null).
 */

import type { ManifestV0 } from "@sfab-lite/core";
import { validateManifest } from "@sfab-lite/core/validate-manifest";
import { z } from "zod";
import type { AppMigration } from "../registry/app-migrations.ts";

export const APP_IMAGE_VERSION = 0;
export const IMAGE_SERVER_KEY = "server.js";

interface ImageV0 {
  image: typeof APP_IMAGE_VERSION;
  runtime: string;
  manifest: ManifestV0;
  server: string;
  client: string[];
  migrations: AppMigration[];
}

export type AppBuild = {
  sha: string;
  serverBundle: string;
  assets: Record<string, string>;
  serverSurfaceHash: string | null;
} & ImageV0;

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
const migrationSchema = z.object({
  id: z.string(),
  sql: z.string(),
});

const storedBuildSchema = z
  .object({
    sha: z.string(),
    serverBundle: z.string(),
    assets: stringRecordSchema,
    serverSurfaceHash: z.string().nullable().optional(),
    runtime: z.string(),
    image: z.literal(APP_IMAGE_VERSION),
    manifest: z.unknown(),
    server: z.string().optional(),
    client: z.array(z.string()).optional(),
    migrations: z.array(migrationSchema),
  })
  .passthrough();

export function parseStoredBuild(raw: unknown): AppBuild | null {
  const parsed = storedBuildSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const record = parsed.data;
  const manifest = validateManifest(record.manifest);
  if (!manifest.ok) {
    return null;
  }
  if (record.runtime === "") {
    return null;
  }
  const serverSurfaceHash =
    typeof record.serverSurfaceHash === "string"
      ? record.serverSurfaceHash
      : null;
  const server =
    typeof record.server === "string" && record.server !== ""
      ? record.server
      : IMAGE_SERVER_KEY;
  return {
    sha: record.sha,
    serverBundle: record.serverBundle,
    assets: record.assets,
    serverSurfaceHash,
    runtime: record.runtime,
    image: APP_IMAGE_VERSION,
    manifest: manifest.manifest,
    server,
    client: record.client ?? [],
    migrations: record.migrations,
  };
}

export function toAppBuild(input: {
  sha: string;
  serverBundle: string;
  assets: Record<string, string>;
  serverSurfaceHash: string | null;
  runtime: string;
  manifest: ManifestV0;
  migrations: AppMigration[];
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
  return {
    "X-Sfab-Runtime": build.runtime,
    "X-Sfab-Image": String(APP_IMAGE_VERSION),
  };
}

function buildKey(appId: string, sha: string): string {
  return `builds/${appId}/${sha}.json`;
}

export function createBuildStore(env: Pick<Env, "CODE_R2">): BuildStore {
  const bucket = env.CODE_R2;

  return {
    async putBuild(appId: string, build: AppBuild): Promise<void> {
      assertPutBuild(build);
      await bucket.put(buildKey(appId, build.sha), JSON.stringify(build), {
        httpMetadata: { contentType: "application/json" },
      });
    },

    async getBuild(appId: string, sha: string): Promise<AppBuild | null> {
      const obj = await bucket.get(buildKey(appId, sha));
      if (!obj) {
        return null;
      }
      return parseStoredBuild(await obj.json());
    },
  };
}
