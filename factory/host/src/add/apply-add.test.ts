import assert from "node:assert/strict";
import { test } from "node:test";
import seed from "@sfab-lite/starter-erp/seed" with { type: "json" };
import { applyAdd } from "./apply-add.ts";

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const BARE_NAME = /bare names are a hard error/;
const PDF_BODY_HELPER = /pdfBody/;
const RESPONSE_RAW_BYTES = /new Response\(bytes/;
const TREE = {
  "manifest.json": `${JSON.stringify(seed.manifest, null, 2)}\n`,
};

test("add lite/field copies deps and writes sha256 provenance", () => {
  const result = applyAdd("lite/field", TREE);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.ok(result.files["src/components/ui/field.tsx"]);
  assert.ok(result.files["src/components/ui/label.tsx"]);
  assert.ok(result.files["src/lib/utils.ts"]);
  assert.ok(result.files["manifest.json"]);
  const manifest = JSON.parse(result.files["manifest.json"] ?? "{}");
  assert.ok(manifest.recipes["lite/field"]);
  assert.ok(manifest.recipes["lite/label"]);
  assert.ok(manifest.recipes["lite/utils"]);
  assert.match(
    manifest.recipes["lite/field"].files["src/components/ui/field.tsx"],
    SHA256
  );
  assert.deepEqual(result.recipes, ["lite/field", "lite/label", "lite/utils"]);
  assert.ok(result.files["package.json"]);
  assert.ok(result.files["tsconfig.json"]);
  assert.ok(result.files["index.html"]);
  assert.ok(result.files["components.json"]);
  const pkg = JSON.parse(result.files["package.json"] ?? "{}");
  assert.equal(pkg.name, "erp");
  assert.equal(typeof pkg.dependencies?.react, "string");
});

test("add lite/pdf-invoice writes modules and the exact pdf-lib pin", () => {
  const result = applyAdd("lite/pdf-invoice", TREE);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.ok(result.files["src/pdf/invoice.ts"]);
  assert.ok(result.files["src/hono/org-protected/pdf-invoice.ts"]);
  const manifest = JSON.parse(result.files["manifest.json"] ?? "{}");
  assert.deepEqual(manifest.modules, [{ name: "pdf-lib", version: "1.17.1" }]);
  const pkg = JSON.parse(result.files["package.json"] ?? "{}");
  assert.equal(pkg.dependencies["pdf-lib"], "1.17.1");
  const route = result.files["src/hono/org-protected/pdf-invoice.ts"] ?? "";
  assert.match(route, PDF_BODY_HELPER);
  assert.doesNotMatch(route, RESPONSE_RAW_BYTES);
});

test("add lite/field leaves modules empty", () => {
  const result = applyAdd("lite/field", TREE);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const manifest = JSON.parse(result.files["manifest.json"] ?? "{}");
  assert.deepEqual(manifest.modules, []);
});

test("bare names never copy files", () => {
  const result = applyAdd("button", {});
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, BARE_NAME);
  }
});

test("re-add overwrites a hand-edited target and updates provenance", () => {
  const first = applyAdd("lite/button", TREE);
  assert.equal(first.ok, true);
  if (!first.ok) {
    return;
  }
  const edited = {
    ...first.files,
    "src/components/ui/button.tsx":
      "export function Button() { return 'no'; }\n",
  };
  const second = applyAdd("lite/button", edited);
  assert.equal(second.ok, true);
  if (!second.ok) {
    return;
  }
  assert.deepEqual(second.overwrote, ["src/components/ui/button.tsx"]);
  assert.equal(
    second.files["src/components/ui/button.tsx"],
    first.files["src/components/ui/button.tsx"]
  );
  const manifest = JSON.parse(second.files["manifest.json"] ?? "{}");
  assert.match(
    manifest.recipes["lite/button"].files["src/components/ui/button.tsx"],
    SHA256
  );
});

test("@lite/field is the same add as lite/field", () => {
  const result = applyAdd("@lite/field", TREE);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.files["src/components/ui/field.tsx"]);
    assert.deepEqual(result.recipes, [
      "lite/field",
      "lite/label",
      "lite/utils",
    ]);
  }
});
