import assert from "node:assert/strict";
import { test } from "node:test";
import type { ManifestV0 } from "@sfab-lite/core";
import {
  clientPrefixesFromManifest,
  isClientAppPath,
} from "./client-prefixes.ts";

const manifest = {
  client: { entry: "src/router.tsx", styles: "src/styles.css" },
} as ManifestV0;

test("clientPrefixesFromManifest includes routeTree.gen.ts as an exact client path", () => {
  const prefixes = clientPrefixesFromManifest(manifest);
  assert.ok(prefixes.includes("/app/src/routeTree.gen.ts"));
  assert.equal(isClientAppPath("/app/src/routeTree.gen.ts", prefixes), true);
  assert.equal(
    isClientAppPath("/app/src/routeTree.gen.ts.bak", prefixes),
    false
  );
});

test("clientPrefixesFromManifest still covers entry, styles, and RFC dirs", () => {
  const prefixes = clientPrefixesFromManifest(manifest);
  assert.ok(prefixes.includes("/app/src/router.tsx"));
  assert.ok(prefixes.includes("/app/src/styles.css"));
  assert.ok(prefixes.includes("/app/src/routes/"));
  assert.equal(isClientAppPath("/app/src/routes/index.tsx", prefixes), true);
  assert.equal(isClientAppPath("/app/src/hono/server.ts", prefixes), false);
});
