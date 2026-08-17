import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { FakeR2Bucket } from "../code-host/test/fake-r2-bucket.ts";
import {
  DRIZZLE_KIT_VERSION,
  DRIZZLE_ORM_VERSION,
  drizzleKitLoaderModules,
  drizzleKitManifestKey,
  drizzleKitModulesKey,
  drizzleKitToolVersion,
  missingDrizzleKitModulesMessage,
  resetDrizzleKitModulesCache,
} from "./drizzle-kit-modules.ts";

afterEach(() => {
  resetDrizzleKitModulesCache();
});

function envWith(bucket: FakeR2Bucket): { KERNEL_R2: FakeR2Bucket } {
  return { KERNEL_R2: bucket };
}

describe("drizzle-kit R2 modules", () => {
  it("missing object is a clear upload error", async () => {
    const result = await drizzleKitLoaderModules(envWith(new FakeR2Bucket()));
    assert.deepEqual(result, {
      ok: false,
      error: missingDrizzleKitModulesMessage(),
    });
    assert.equal(
      missingDrizzleKitModulesMessage(),
      `drizzle-kit modules not uploaded for ${DRIZZLE_KIT_VERSION}-${DRIZZLE_ORM_VERSION} — run upload`
    );
  });

  it("manifest without modules.json is the same upload error", async () => {
    const bucket = new FakeR2Bucket();
    await bucket.put(
      drizzleKitManifestKey(),
      JSON.stringify({
        drizzleKit: DRIZZLE_KIT_VERSION,
        drizzleOrm: DRIZZLE_ORM_VERSION,
      })
    );
    const result = await drizzleKitLoaderModules(envWith(bucket));
    assert.deepEqual(result, {
      ok: false,
      error: missingDrizzleKitModulesMessage(),
    });
  });

  it("loads the module map once the version prefix is uploaded", async () => {
    const bucket = new FakeR2Bucket();
    await bucket.put(
      drizzleKitModulesKey(),
      JSON.stringify({ "api.mjs": "export const ok = true;\n" })
    );
    await bucket.put(
      drizzleKitManifestKey(),
      JSON.stringify({
        drizzleKit: DRIZZLE_KIT_VERSION,
        drizzleOrm: DRIZZLE_ORM_VERSION,
      })
    );
    const result = await drizzleKitLoaderModules(envWith(bucket));
    assert.equal(result.ok, true);
    assert.equal(
      result.ok ? result.modules["api.mjs"]?.js : undefined,
      "export const ok = true;\n"
    );
  });

  it("caches the map for the isolate after the first fetch", async () => {
    const bucket = new FakeR2Bucket();
    await bucket.put(
      drizzleKitModulesKey(),
      JSON.stringify({ "api.mjs": "export const ok = true;\n" })
    );
    await bucket.put(
      drizzleKitManifestKey(),
      JSON.stringify({
        drizzleKit: DRIZZLE_KIT_VERSION,
        drizzleOrm: DRIZZLE_ORM_VERSION,
      })
    );
    const env = envWith(bucket);
    assert.equal((await drizzleKitLoaderModules(env)).ok, true);
    await bucket.delete([drizzleKitManifestKey(), drizzleKitModulesKey()]);
    const cached = await drizzleKitLoaderModules(env);
    assert.equal(cached.ok, true);
    assert.equal(
      cached.ok ? cached.modules["api.mjs"]?.js : undefined,
      "export const ok = true;\n"
    );
    assert.equal(drizzleKitToolVersion(), "0.31.10-0.45.2");
  });
});
