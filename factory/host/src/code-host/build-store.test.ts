import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ManifestV0 } from "@sfab-lite/core";
import {
  APP_IMAGE_VERSION,
  assertPutBuild,
  IMAGE_SERVER_KEY,
  ImageRequiredError,
  imageServeHeaders,
  parseStoredBuild,
  toAppBuild,
} from "./build-store.ts";

const MANIFEST = {
  format: 0,
  name: "erp",
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
  capabilities: [],
  modules: [],
  recipes: {
    "lite/button": {
      version: "0.1.0",
      files: {
        "src/components/ui/button.tsx":
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    },
  },
} as ManifestV0;

function imageBuild() {
  return toAppBuild({
    sha: "abc",
    serverBundle: "export default {}",
    assets: {
      "index.html": "<html></html>",
      "assets/app.js": "console.log(1)",
      "assets/app.css": "body{}",
    },
    serverSurfaceHash: "sha256:surface",
    runtime: "0.4.0",
    manifest: MANIFEST,
    migrations: [
      { id: "0001_auth", sql: "CREATE TABLE user (id TEXT);" },
      { id: "0002_erp", sql: "CREATE TABLE party (id TEXT);" },
    ],
  });
}

describe("assertPutBuild", () => {
  it("accepts image v0", () => {
    assert.doesNotThrow(() => assertPutBuild(imageBuild()));
  });

  it("refuses an image-less record", () => {
    assert.throws(
      () =>
        assertPutBuild({
          ...imageBuild(),
          image: null,
        } as unknown as ReturnType<typeof imageBuild>),
      ImageRequiredError
    );
  });
});

describe("parseStoredBuild", () => {
  it("returns null for legacy kernelVersion records", () => {
    const parsed = parseStoredBuild({
      sha: "old",
      serverBundle: "export default {}",
      assets: { "index.html": "<html></html>" },
      kernelVersion: "0.4.0",
      serverSurfaceHash: null,
    });
    assert.equal(parsed, null);
  });

  it("returns image v0 fields for new records", () => {
    const stored = imageBuild();
    const parsed = parseStoredBuild(JSON.parse(JSON.stringify(stored)));
    assert.ok(parsed);
    assert.equal(parsed.image, APP_IMAGE_VERSION);
    assert.equal(parsed.runtime, "0.4.0");
    assert.equal(parsed.server, IMAGE_SERVER_KEY);
    assert.deepEqual(parsed.manifest?.recipes, MANIFEST.recipes);
    assert.deepEqual(parsed.migrations, stored.migrations);
  });
});

describe("toAppBuild", () => {
  it("snapshots manifest.recipes from the tree at pack", () => {
    const build = imageBuild();
    assert.deepEqual(build.manifest.recipes, MANIFEST.recipes);
    const planted = {
      ...MANIFEST,
      recipes: {
        "lite/alert": {
          version: "0.1.0",
          files: {
            "src/components/ui/alert.tsx":
              "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          },
        },
      },
    } as ManifestV0;
    const mismatch = toAppBuild({
      sha: "abc",
      serverBundle: "export default {}",
      assets: { "index.html": "<html></html>" },
      serverSurfaceHash: null,
      runtime: "0.4.0",
      manifest: planted,
      migrations: [],
    });
    assert.notDeepEqual(mismatch.manifest.recipes, MANIFEST.recipes);
    assert.deepEqual(mismatch.manifest.recipes, planted.recipes);
  });

  it("records asset keys and migration id+sql", () => {
    const build = imageBuild();
    assert.deepEqual(build.client, ["assets/app.css", "assets/app.js"]);
    assert.equal(build.migrations[0]?.id, "0001_auth");
    assert.ok(build.migrations[0]?.sql.includes("CREATE TABLE"));
  });
});

describe("imageServeHeaders", () => {
  it("exposes runtime and image version for v0", () => {
    assert.deepEqual(imageServeHeaders(imageBuild()), {
      "X-Sfab-Runtime": "0.4.0",
      "X-Sfab-Image": "0",
    });
  });
});
