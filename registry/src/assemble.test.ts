import assert from "node:assert/strict";
import { test } from "node:test";
import { assemble, assembleAll } from "./lite.ts";
import type { Catalog, CatalogEntry } from "./types.ts";

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

const catalog: Catalog = {
  schemaPin: {
    url: "https://example.test",
    fetched: "2026-08-14",
    sha256: "sha256:00",
    vendoredPath: "schema/registry-item.json",
  },
  items: {
    "lite/button": entry(
      "lite/button",
      "src/components/ui/button.tsx",
      "export function Button() { return null; }\n"
    ),
    "lite/sidebar": entry(
      "lite/sidebar",
      "src/components/ui/sidebar.tsx",
      "export function Sidebar() { return null; }\n"
    ),
  },
};

test("assemble a subset does not copy the rest of the catalog", () => {
  const result = assemble(catalog, ["lite/button"]);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.deepEqual(Object.keys(result.provenance).sort(), ["lite/button"]);
  assert.equal("src/components/ui/sidebar.tsx" in result.writes, false);
});

test("assembleAll still copies every catalog name", () => {
  const result = assembleAll(catalog);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.deepEqual(Object.keys(result.provenance).sort(), [
    "lite/button",
    "lite/sidebar",
  ]);
  assert.equal("src/components/ui/sidebar.tsx" in result.writes, true);
});
