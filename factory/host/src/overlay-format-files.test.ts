import assert from "node:assert/strict";
import { test } from "node:test";
import seed from "@sfab-lite/starter-erp/seed" with { type: "json" };
import { applyAdd } from "./add/apply-add.ts";
import { overlayFormatFiles } from "./overlay-format-files.ts";

const TREE = {
  "manifest.json": `${JSON.stringify(seed.manifest, null, 2)}\n`,
};

test("overlay recomputes modules from recipes after an owner lodash edit", () => {
  const added = applyAdd("lite/pdf-invoice", TREE);
  assert.equal(added.ok, true);
  if (!added.ok) {
    return;
  }
  const parsed = JSON.parse(added.files["manifest.json"] ?? "{}");
  parsed.modules = [{ name: "lodash", version: "4.17.21" }];
  const overlaid = overlayFormatFiles({
    ...added.files,
    "manifest.json": `${JSON.stringify(parsed, null, 2)}\n`,
  });
  assert.deepEqual(overlaid.manifest.modules, [
    { name: "pdf-lib", version: "1.17.1" },
  ]);
  const pkg = JSON.parse(overlaid.files["package.json"] ?? "{}");
  assert.equal(pkg.dependencies["pdf-lib"], "1.17.1");
  assert.equal(pkg.dependencies.lodash, undefined);
});

test("overlay strips a catalog pin that has no enabling recipe", () => {
  const parsed = JSON.parse(TREE["manifest.json"]);
  parsed.modules = [{ name: "pdf-lib", version: "1.17.1" }];
  const overlaid = overlayFormatFiles({
    ...TREE,
    "manifest.json": `${JSON.stringify(parsed, null, 2)}\n`,
  });
  assert.deepEqual(overlaid.manifest.modules, []);
  const pkg = JSON.parse(overlaid.files["package.json"] ?? "{}");
  assert.equal(pkg.dependencies["pdf-lib"], undefined);
});
