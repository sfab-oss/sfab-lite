import { z } from "zod";

const treeFilesSchema = z.record(z.string(), z.string());

export interface TreeStore {
  put: (
    appId: string,
    sha: string,
    files: Record<string, string>
  ) => Promise<void>;
  get: (appId: string, sha: string) => Promise<Record<string, string> | null>;
}

function treeKey(appId: string, sha: string): string {
  return `trees/${appId}/${sha}.json`;
}

export function createTreeStore(
  bucket: Pick<R2Bucket, "get" | "put">
): TreeStore {
  return {
    async put(appId, sha, files) {
      await bucket.put(treeKey(appId, sha), JSON.stringify(files), {
        httpMetadata: { contentType: "application/json" },
      });
    },

    async get(appId, sha) {
      const obj = await bucket.get(treeKey(appId, sha));
      if (!obj) {
        return null;
      }
      try {
        const parsed = treeFilesSchema.safeParse(JSON.parse(await obj.text()));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
  };
}
