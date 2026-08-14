import assert from "node:assert/strict";
import { test } from "node:test";
import { contentHash, planAdd } from "./lite.ts";
import type { Catalog, CatalogEntry } from "./types.ts";

const COLLISION = /collision/;

function entry(name: string, target: string, body: string): CatalogEntry {
  return {
    version: "0.1.0",
    item: {
      name,
      type: "registry:ui",
      title: name,
      description: "test",
      registryDependencies: [],
      files: [{ path: "x.ts", type: "registry:ui", target }],
      meta: { liteProfile: 1, liteRuntime: ">=0.4.0" },
    },
    contents: { [target]: body },
  };
}

const target = "src/components/ui/button.tsx";
const incoming = "export function Button() { return null; }\n";
const catalog: Catalog = {
  schemaPin: {
    url: "https://example.test",
    fetched: "2026-08-14",
    sha256: "sha256:00",
    vendoredPath: "schema/registry-item.json",
  },
  items: {
    "lite/button": entry("lite/button", target, incoming),
  },
};

test("add writes missing targets and records sha256 provenance", () => {
  const result = planAdd("lite/button", catalog, {});
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.writes[target], incoming);
  assert.equal(
    result.provenance["lite/button"]?.files[target],
    contentHash(incoming)
  );
});

test("collision refuses a target whose hash differs", () => {
  const result = planAdd("lite/button", catalog, {
    [target]: "export function Button() { return 'edited'; }\n",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, COLLISION);
    assert.equal(result.collisions?.[0]?.path, target);
    assert.notEqual(
      result.collisions?.[0]?.existing,
      result.collisions?.[0]?.incoming
    );
  }
});

test("identical existing content is skipped, not overwritten", () => {
  const result = planAdd("lite/button", catalog, { [target]: incoming });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.writes, {});
    assert.deepEqual(result.skipped, [target]);
  }
});
