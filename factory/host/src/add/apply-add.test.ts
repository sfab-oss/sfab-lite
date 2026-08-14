import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAdd } from "./apply-add.ts";

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const BARE_NAME = /bare names are a hard error/;
const COLLISION = /collision/;

test("add lite/field copies deps and writes sha256 provenance", () => {
  const result = applyAdd("lite/field", {});
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
});

test("bare names never copy files", () => {
  const result = applyAdd("button", {});
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, BARE_NAME);
  }
});

test("collision refuses a hand-edited target", () => {
  const first = applyAdd("lite/button", {});
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
  assert.equal(second.ok, false);
  if (!second.ok) {
    assert.match(second.error, COLLISION);
    assert.equal(second.collisions?.[0]?.path, "src/components/ui/button.tsx");
  }
});
