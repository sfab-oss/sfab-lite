import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GENERATED_ARTIFACTS,
  HOST_AUTHORITATIVE_FIELDS,
  MANIFEST_CAPABILITIES,
  MANIFEST_FORMAT,
  type ManifestV0,
} from "./manifest.ts";
import { validateManifest } from "./validate-manifest.ts";

type ManifestOverrides = {
  [K in keyof ManifestV0]?: unknown;
} & { extra?: unknown };

function valid(overrides: ManifestOverrides = {}) {
  return {
    format: MANIFEST_FORMAT,
    name: "erp",
    runtime: "^0",
    adapter: "cloudflare",
    root: "app",
    server: { entry: "src/hono/index.ts", exportName: "app" },
    client: { entry: "src/ui/main.tsx", styles: "src/ui/styles.css" },
    html: "index.html",
    safelist: "safelist.txt",
    migrations: "migrations",
    schema: "src/db/schema/index.ts",
    inject: { "biome.json": "../../framework/toolchain/app-biome.json" },
    source: {
      dirs: ["src", "migrations"],
      extensions: [".ts", ".tsx", ".css", ".sql", ".json"],
      files: ["safelist.txt", "package.json", "tsconfig.json"],
      exclude: ["src/worker.ts"],
    },
    capabilities: [],
    modules: [],
    recipes: {},
    ...overrides,
  };
}

function issuePaths(input: unknown): string[] {
  const result = validateManifest(input);
  assert.equal(result.ok, false);
  return result.issues.map((i) => i.path);
}

function issueAt(input: unknown, path: string): string {
  const result = validateManifest(input);
  assert.equal(result.ok, false);
  const hit = result.issues.find((i) => i.path === path);
  assert.ok(
    hit,
    `expected an issue at ${path}, got ${JSON.stringify(result.issues)}`
  );
  return hit.message;
}

test("a complete v0 manifest validates", () => {
  const result = validateManifest(valid());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.manifest.format, 0);
    assert.equal(result.manifest.runtime, "^0");
    assert.equal(result.manifest.adapter, "cloudflare");
  }
});

test("recipes with exact versions and sha256 hashes validate", () => {
  const result = validateManifest(
    valid({
      recipes: {
        "lite/party-form": {
          version: "0.1.0",
          files: {
            "src/components/parties/party-form.tsx":
              "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
        },
      },
    })
  );
  assert.equal(result.ok, true);
});

test("missing format fails", () => {
  const body: ManifestOverrides = valid();
  body.format = undefined;
  assert.ok(issuePaths(body).includes("format"));
});

test("string format is not literal 0", () => {
  assert.equal(issueAt(valid({ format: "0" }), "format"), "expected literal 0");
});

test("runtime must be a line pin ^N, not a semver range", () => {
  assert.equal(
    issueAt(valid({ runtime: "^1.0.0" }), "runtime"),
    "expected a line pin ^N (integer N)"
  );
  assert.equal(
    issueAt(valid({ runtime: ">=1.0.0" }), "runtime"),
    "expected a line pin ^N (integer N)"
  );
  assert.equal(
    issueAt(valid({ runtime: "0.4.0" }), "runtime"),
    "expected a line pin ^N (integer N)"
  );
});

test("interpolation in any string fails", () => {
  const interpolatedName = `$${""}{APP_NAME}`;
  assert.equal(
    issueAt(valid({ name: interpolatedName }), "name"),
    "interpolation is not allowed"
  );
  assert.equal(
    issueAt(valid({ html: "{{html}}" }), "html"),
    "interpolation is not allowed"
  );
});

test("unknown adapter target fails closed", () => {
  assert.ok(
    issueAt(valid({ adapter: "aws" }), "adapter").includes("unknown adapter")
  );
});

test("unknown capability fails closed with the allowed list", () => {
  assert.equal(
    issueAt(valid({ capabilities: ["email"] }), "capabilities[0]"),
    'unknown capability "email" (allowed: storage)'
  );
});

test("storage is an allowed capability", () => {
  const result = validateManifest(valid({ capabilities: ["storage"] }));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.manifest.capabilities, ["storage"]);
  }
});

test("unknown top-level keys fail", () => {
  assert.ok(issuePaths(valid({ extra: true })).includes("extra"));
});

test("recipe version ranges fail", () => {
  const body = valid({
    recipes: {
      "lite/party-form": { version: "^0.1.0", files: {} },
    },
  });
  assert.equal(
    issueAt(body, "recipes.lite/party-form.version"),
    "expected an exact version (no ranges)"
  );
});

test("bare recipe names fail", () => {
  const body = valid({
    recipes: { button: { version: "1.0.0", files: {} } },
  });
  assert.ok(issueAt(body, "recipes.button").includes("lite/<slug>"));
});

test("module version ranges fail", () => {
  const body = valid({
    modules: [{ name: "heavy-pdf", version: "~1.2.3" }],
  });
  assert.equal(
    issueAt(body, "modules[0].version"),
    "expected an exact version (no ranges)"
  );
});

test("unknown catalog module names fail closed", () => {
  const body = valid({
    modules: [{ name: "lodash", version: "4.17.21" }],
  });
  assert.equal(
    issueAt(body, "modules[0].name"),
    'unknown catalog module "lodash"'
  );
});

test("wrong catalog pins fail closed", () => {
  const body = valid({
    modules: [{ name: "pdf-lib", version: "9.9.9" }],
  });
  assert.equal(
    issueAt(body, "modules[0].version"),
    'catalog pin for "pdf-lib" must be 1.17.1 (got 9.9.9)'
  );
});

test("the catalog pdf-lib pin validates", () => {
  const result = validateManifest(
    valid({ modules: [{ name: "pdf-lib", version: "1.17.1" }] })
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.manifest.modules, [
      { name: "pdf-lib", version: "1.17.1" },
    ]);
  }
});

test("the catalog exceljs pin validates", () => {
  const result = validateManifest(
    valid({ modules: [{ name: "exceljs", version: "4.4.0" }] })
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.manifest.modules, [
      { name: "exceljs", version: "4.4.0" },
    ]);
  }
});

test("bad snapshot hash shape fails", () => {
  const body = valid({
    recipes: {
      "lite/x": {
        version: "1.0.0",
        files: { "src/a.ts": "sha256:deadbeef" },
      },
    },
  });
  assert.ok(issueAt(body, "recipes.lite/x.files.src/a.ts").includes("sha256"));
});

test("non-object input fails", () => {
  const result = validateManifest(null);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.issues[0]?.message, "expected a JSON object");
  }
});

test("generated artifact paths and host-authoritative fields are part of the schema", () => {
  assert.equal(GENERATED_ARTIFACTS.apiDts, "src/generated/api.d.ts");
  assert.equal(GENERATED_ARTIFACTS.apiHash, "src/generated/api.hash");
  assert.equal(GENERATED_ARTIFACTS.componentsJson, "components.json");
  assert.equal(GENERATED_ARTIFACTS.dbIndex, "src/db/index.ts");
  assert.equal(GENERATED_ARTIFACTS.storageIndex, "src/storage/index.ts");
  assert.ok(HOST_AUTHORITATIVE_FIELDS.includes("runtime"));
  assert.ok(HOST_AUTHORITATIVE_FIELDS.includes("modules"));
  assert.ok(HOST_AUTHORITATIVE_FIELDS.includes("recipes"));
  assert.deepEqual([...MANIFEST_CAPABILITIES], ["storage"]);
});
