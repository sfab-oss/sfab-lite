import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAdd } from "./lite.ts";
import type { Catalog, CatalogEntry } from "./types.ts";

const BARE_NAME = /bare names are a hard error/;

function entry(name: string, deps: string[], target: string): CatalogEntry {
  return {
    version: "0.1.0",
    item: {
      name,
      type: "registry:ui",
      title: name,
      description: "test",
      registryDependencies: deps,
      files: [{ path: "x.ts", type: "registry:ui", target }],
      meta: { liteProfile: 1, liteRuntime: ">=0.4.0" },
    },
    contents: { [target]: `export const ${name.replaceAll("/", "_")} = 1;\n` },
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
    "lite/utils": entry("lite/utils", [], "src/lib/utils.ts"),
    "lite/button": entry(
      "lite/button",
      ["lite/utils"],
      "src/components/ui/button.tsx"
    ),
  },
};

test("bare names error before catalog lookup", () => {
  const result = resolveAdd("button", catalog);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, BARE_NAME);
  }
});

test("flat resolve puts dependencies first", () => {
  const result = resolveAdd("lite/button", catalog);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(
      result.entries.map((e) => e.item.name),
      ["lite/utils", "lite/button"]
    );
  }
});
