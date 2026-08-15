import type { AppBuild, BuildStore } from "./build-store.js";
import { assertPutBuild, parseStoredBuild } from "./build-store.js";

function buildKey(appId: string, sha: string): string {
  return `builds/${appId}/${sha}.json`;
}

export function createR2BuildStore(env: Env): BuildStore {
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
