import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ManifestV0 } from "@sfab-lite/core";
import { generateFormatFiles } from "@sfab-lite/core/generate-format-files";
import { FakeR2Bucket } from "../code-host/test/fake-r2-bucket.ts";
import {
  deleteAppObjectStorage,
  deleteStoragePrefix,
  manifestHasStorage,
  PrefixedR2Bucket,
  storagePrefixForTarget,
} from "./app-storage.ts";

const RELATIVE_KEY = /relative/;
const RELATIVE_PATH = /relative path/;
const NO_PINS = { dependencies: {}, devDependencies: {} };
const REGISTRY_URL = "https://lite.sfab.dev/r/{name}.json";

function storageManifest(): ManifestV0 {
  return {
    format: 0,
    name: "fixture",
    runtime: "^0",
    adapter: "cloudflare",
    root: "app",
    server: { entry: "src/server.ts", exportName: "app" },
    client: { entry: "src/router.tsx", styles: "src/styles.css" },
    html: "index.html",
    safelist: "safelist.txt",
    migrations: "migrations",
    schema: "src/db/schema.ts",
    inject: {},
    source: {
      dirs: ["src"],
      extensions: [".ts"],
      files: ["package.json"],
      exclude: [],
    },
    capabilities: ["storage"],
    modules: [],
    recipes: {},
  };
}

describe("prefixed app storage", () => {
  it("generator emits the storage shim only when declared", () => {
    const withStorage = generateFormatFiles(storageManifest(), NO_PINS, {
      registryUrl: REGISTRY_URL,
    });
    assert.ok(withStorage["src/storage/index.ts"]?.includes("createStorage"));
    const without = generateFormatFiles(
      { ...storageManifest(), capabilities: [] },
      NO_PINS,
      { registryUrl: REGISTRY_URL }
    );
    assert.equal(without["src/storage/index.ts"], undefined);
    assert.equal(manifestHasStorage(storageManifest()), true);
    assert.equal(
      manifestHasStorage({ ...storageManifest(), capabilities: [] }),
      false
    );
  });

  it("put then get round-trips under the generation prefix", async () => {
    const bucket = new FakeR2Bucket();
    const live = new PrefixedR2Bucket(
      bucket,
      storagePrefixForTarget({ mode: "live", appId: "app_1" })
    );
    await live.put("docs/a.txt", "hello", {
      httpMetadata: { contentType: "text/plain" },
      customMetadata: { source: "test" },
    });
    const got = await live.get("docs/a.txt");
    assert.ok(got);
    assert.equal(got.key, "docs/a.txt");
    assert.equal(await got.text(), "hello");
    assert.equal(got.httpMetadata?.contentType, "text/plain");
    assert.equal(got.customMetadata?.source, "test");
    assert.deepEqual(bucket.keys(), ["apps/app_1/live/docs/a.txt"]);
  });

  it("preview generation cannot see live keys", async () => {
    const bucket = new FakeR2Bucket();
    const live = new PrefixedR2Bucket(
      bucket,
      storagePrefixForTarget({ mode: "live", appId: "app_1" })
    );
    const preview = new PrefixedR2Bucket(
      bucket,
      storagePrefixForTarget({
        mode: "preview",
        appId: "app_1",
        prNumber: 7,
      })
    );
    await live.put("secret.txt", "live-only");
    assert.equal(await preview.get("secret.txt"), null);
    await preview.put("secret.txt", "preview");
    assert.equal(await (await live.get("secret.txt"))?.text(), "live-only");
    assert.equal(await (await preview.get("secret.txt"))?.text(), "preview");
    const listed = await preview.list();
    assert.deepEqual(
      listed.objects.map((o) => o.key),
      ["secret.txt"]
    );
  });

  it("rejects keys that would leave the relative namespace", async () => {
    const bucket = new FakeR2Bucket();
    const live = new PrefixedR2Bucket(
      bucket,
      storagePrefixForTarget({ mode: "live", appId: "app_1" })
    );
    await assert.rejects(live.put("../escape", "nope"), RELATIVE_PATH);
    await assert.rejects(live.get("/abs"), RELATIVE_KEY);
    await assert.rejects(live.list({ prefix: "../" }), RELATIVE_PATH);
    assert.deepEqual(bucket.keys(), []);
  });

  it("delete removes the app prefix and not sibling apps", async () => {
    const bucket = new FakeR2Bucket();
    const a = new PrefixedR2Bucket(
      bucket,
      storagePrefixForTarget({ mode: "live", appId: "app_a" })
    );
    const b = new PrefixedR2Bucket(
      bucket,
      storagePrefixForTarget({ mode: "live", appId: "app_b" })
    );
    await a.put("one", "1");
    await a.put("two", "2");
    await b.put("keep", "yes");
    await deleteStoragePrefix(bucket, "apps/app_a/");
    assert.deepEqual(bucket.keys(), ["apps/app_b/live/keep"]);
    await deleteAppObjectStorage(bucket, "app_b", ["ws_other"]);
    assert.deepEqual(bucket.keys(), []);
  });
});
