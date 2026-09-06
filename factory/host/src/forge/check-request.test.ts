import assert from "node:assert/strict";
import { test } from "node:test";
import type { ManifestV0 } from "@sfab-lite/core";
import type { OverlaidTree } from "@sfab-lite/verbs/format";
import { checkRequestBody } from "./check-request.ts";

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

function tree(modules: ManifestV0["modules"] = []): OverlaidTree {
  return {
    files: { "src/server.ts": "export const app = {};\n" },
    manifest: manifest(modules),
  };
}

test("empty modules omit moduleTypes so the payload matches today", () => {
  const body = checkRequestBody("app_1", tree(), false);
  assert.equal("moduleTypes" in body, false);
  assert.deepEqual(Object.keys(body).sort(), [
    "appId",
    "files",
    "forceCold",
    "manifest",
  ]);
});

test("declared pdf-lib attaches the cheap stub map", () => {
  const body = checkRequestBody(
    "app_1",
    tree([{ name: "pdf-lib", version: "1.17.1" }]),
    true
  );
  assert.ok(body.moduleTypes);
  assert.ok(
    body.moduleTypes["/node_modules/pdf-lib/index.d.ts"]?.includes(
      "PDFDocument"
    )
  );
  assert.equal("boundaryModuleTypes" in body, false);
});
