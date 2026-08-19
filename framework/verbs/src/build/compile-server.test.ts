import assert from "node:assert/strict";
import { test } from "node:test";
import type { ManifestV0 } from "@sfab-lite/core";
import { catalogServerExtras } from "./compile-server.ts";

function manifest(modules: ManifestV0["modules"] = []): ManifestV0 {
  return {
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
    modules,
    recipes: {},
  };
}

test("declared pdf-lib is a compile-time external, not a kernel pin", () => {
  const extras = catalogServerExtras(
    manifest([{ name: "pdf-lib", version: "1.17.1" }])
  );
  assert.deepEqual(extras.externals, ["pdf-lib.js"]);
  assert.match(extras.virtualModules["pdf-lib"] ?? "", /from "pdf-lib\.js"/);
});

test("modules: [] adds no catalog compile extras", () => {
  const extras = catalogServerExtras(manifest([]));
  assert.deepEqual(extras.externals, []);
  assert.deepEqual(extras.virtualModules, {});
});
