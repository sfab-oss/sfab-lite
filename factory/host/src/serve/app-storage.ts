import type { ManifestV0 } from "@sfab-lite/core";
import { mapLimit } from "../code-host/copy-tree.ts";
import type {
  ObjectStore,
  ObjectStoreBody,
  ObjectStoreHead,
  ObjectStoreListOptions,
  ObjectStorePutOptions,
  ObjectStorePutValue,
} from "../code-host/object-store.ts";
import type { ServeTarget } from "../registry/serve-target.js";

const DELETE_CONCURRENCY = 16;

export function storagePrefixForTarget(target: ServeTarget): string {
  if (target.mode === "preview") {
    return `apps/${target.appId}/pr:${target.prNumber}/`;
  }
  if (target.mode === "workspace") {
    return `apps/${target.workspaceId}/ws/`;
  }
  return `apps/${target.appId}/live/`;
}

function storageAppPrefix(appId: string): string {
  return `apps/${appId}/`;
}

export function storageWorkspacePrefix(workspaceId: string): string {
  return `apps/${workspaceId}/ws/`;
}

export function manifestHasStorage(
  manifest: ManifestV0 | null | undefined
): boolean {
  return manifest?.capabilities.includes("storage") === true;
}

function assertRelativeKey(key: string): void {
  if (key.length === 0) {
    throw new Error("storage key must be non-empty");
  }
  if (key.startsWith("/")) {
    throw new Error("storage keys are relative");
  }
  for (const part of key.split("/")) {
    if (part === "" || part === "." || part === "..") {
      throw new Error(`storage key is not a relative path: ${key}`);
    }
  }
}

function assertRelativePrefix(prefix: string): void {
  if (prefix.length === 0) {
    return;
  }
  const trimmed = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  if (trimmed.length === 0) {
    throw new Error("storage keys are relative");
  }
  assertRelativeKey(trimmed);
}

export class PrefixedR2Bucket {
  readonly #inner: ObjectStore;
  readonly prefix: string;

  constructor(inner: ObjectStore, prefix: string) {
    this.#inner = inner;
    this.prefix = prefix;
  }

  put(
    key: string,
    value: ObjectStorePutValue,
    options?: ObjectStorePutOptions
  ): Promise<ObjectStoreHead | null> {
    try {
      assertRelativeKey(key);
    } catch (err) {
      return Promise.reject(err);
    }
    return this.#inner.put(`${this.prefix}${key}`, value, options);
  }

  async get(key: string): Promise<PrefixedR2Body | null> {
    assertRelativeKey(key);
    const obj = await this.#inner.get(`${this.prefix}${key}`);
    if (obj == null) {
      return null;
    }
    return exposeBody(obj, key);
  }

  async head(key: string): Promise<PrefixedR2Head | null> {
    assertRelativeKey(key);
    const obj = await this.#inner.head(`${this.prefix}${key}`);
    if (obj == null) {
      return null;
    }
    return exposeHead(obj, key);
  }

  delete(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) {
      assertRelativeKey(key);
    }
    return this.#inner.delete(list.map((key) => `${this.prefix}${key}`));
  }

  async list(options?: ObjectStoreListOptions): Promise<{
    objects: PrefixedR2Head[];
    truncated: boolean;
    cursor?: string;
    delimitedPrefixes: string[];
  }> {
    const userPrefix = options?.prefix ?? "";
    assertRelativePrefix(userPrefix);
    const listed = await this.#inner.list({
      ...options,
      prefix: `${this.prefix}${userPrefix}`,
    });
    return {
      ...listed,
      objects: listed.objects.map((obj) =>
        exposeHead(obj, obj.key.slice(this.prefix.length))
      ),
    };
  }
}

export interface PrefixedR2Head {
  key: string;
  size: number;
  etag: string;
  uploaded: Date;
  httpMetadata?: ObjectStoreHead["httpMetadata"];
  customMetadata?: Record<string, string>;
}

export interface PrefixedR2Body extends PrefixedR2Head {
  body: ObjectStoreBody["body"];
  arrayBuffer: () => Promise<ArrayBuffer>;
  text: () => Promise<string>;
}

function exposeHead(obj: ObjectStoreHead, key: string): PrefixedR2Head {
  return {
    key,
    size: obj.size,
    etag: obj.etag,
    uploaded: obj.uploaded,
    httpMetadata: obj.httpMetadata,
    customMetadata: obj.customMetadata,
  };
}

function exposeBody(obj: ObjectStoreBody, key: string): PrefixedR2Body {
  const exposed: PrefixedR2Body = {
    ...exposeHead(obj, key),
    body: obj.body,
    arrayBuffer: () => obj.arrayBuffer(),
    text: () => obj.text(),
  };
  return exposed;
}

export async function deleteStoragePrefix(
  bucket: ObjectStore,
  prefix: string
): Promise<void> {
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix, cursor, limit: 1000 });
    if (listed.objects.length > 0) {
      await mapLimit(listed.objects, DELETE_CONCURRENCY, (obj) =>
        bucket.delete(obj.key)
      );
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

export async function deleteAppObjectStorage(
  bucket: ObjectStore,
  appId: string,
  workspaceIds: readonly string[]
): Promise<void> {
  await deleteStoragePrefix(bucket, storageAppPrefix(appId));
  await mapLimit(workspaceIds, DELETE_CONCURRENCY, (id) =>
    deleteStoragePrefix(bucket, storageWorkspacePrefix(id))
  );
}
