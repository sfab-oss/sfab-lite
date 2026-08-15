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
    migrations: ["0001_auth.sql", "0002_erp.sql"],
  });
}

describe("assertPutBuild", () => {
  it("accepts image v0", () => {
    assert.doesNotThrow(() => assertPutBuild(imageBuild()));
  });

  it("refuses an image-less record", () => {
    const legacy = parseStoredBuild({
      sha: "old",
      serverBundle: "export default {}",
      assets: { "index.html": "<html></html>" },
      kernelVersion: "0.4.0",
      serverSurfaceHash: null,
    });
    assert.ok(legacy);
    assert.throws(() => assertPutBuild(legacy), ImageRequiredError);
  });
});

describe("parseStoredBuild", () => {
  it("fills image: null for legacy kernelVersion records", () => {
    const parsed = parseStoredBuild({
      sha: "old",
      serverBundle: "export default {}",
      assets: { "index.html": "<html></html>" },
      kernelVersion: "0.4.0",
      serverSurfaceHash: null,
    });
    assert.ok(parsed);
    assert.equal(parsed.image, null);
    assert.equal(parsed.runtime, "0.4.0");
    assert.equal(parsed.manifest, null);
  });

  it("returns image v0 fields for new records", () => {
    const stored = imageBuild();
    const parsed = parseStoredBuild(JSON.parse(JSON.stringify(stored)));
    assert.ok(parsed);
    assert.equal(parsed.image, APP_IMAGE_VERSION);
    assert.equal(parsed.runtime, "0.4.0");
    assert.equal(parsed.server, IMAGE_SERVER_KEY);
    assert.deepEqual(parsed.manifest?.recipes, MANIFEST.recipes);
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

  it("records asset keys and migration file names", () => {
    const build = imageBuild();
    assert.deepEqual(build.client, ["assets/app.css", "assets/app.js"]);
    assert.deepEqual(build.migrations, ["0001_auth.sql", "0002_erp.sql"]);
  });
});

describe("imageServeHeaders", () => {
  it("exposes runtime and image version for v0", () => {
    assert.deepEqual(imageServeHeaders(imageBuild()), {
      "X-Sfab-Runtime": "0.4.0",
      "X-Sfab-Image": "0",
    });
  });

  it("exposes runtime only for legacy", () => {
    const legacy = parseStoredBuild({
      sha: "old",
      serverBundle: "x",
      assets: { "index.html": "y" },
      kernelVersion: "0.3.0",
      serverSurfaceHash: null,
    });
    assert.ok(legacy);
    assert.deepEqual(imageServeHeaders(legacy), {
      "X-Sfab-Runtime": "0.3.0",
    });
  });
});
