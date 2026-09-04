import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluatePlacement,
  packageRoot,
  parsePinName,
  servedPackageRoots,
} from "./check-pin-placement-lib.mjs";

const kernel = servedPackageRoots(
  { react: "./react.js", "zod/v4/core": "./zod.js" },
  { hono: "./hono.js", zod: "./zod.js" }
);

const live = {
  catalogPins: [
    { name: "pdf-lib", version: "1.17.1" },
    { name: "exceljs", version: "4.4.0" },
  ],
  kernelPackageRoots: kernel,
  catalogEnablingRecipes: [
    { name: "lite/pdf-invoice", pinNames: ["pdf-lib"] },
    { name: "lite/xlsx-export", pinNames: ["exceljs"] },
  ],
  starters: [
    { starter: "base", recipes: ["lite/utils"] },
    { starter: "erp", recipes: ["lite/utils"] },
    { starter: "heavy", recipes: ["lite/utils"] },
  ],
};

test("packageRoot peels scoped and subpath specifiers", () => {
  assert.equal(packageRoot("zod/v4/core"), "zod");
  assert.equal(packageRoot("@tanstack/react-table"), "@tanstack/react-table");
});

test("parsePinName reads name@version", () => {
  assert.equal(parsePinName("pdf-lib@1.17.1"), "pdf-lib");
  assert.equal(parsePinName("pdf-lib"), null);
});

test("live-shaped placement is green", () => {
  assert.deepEqual(evaluatePlacement(live), []);
});

test("catalog pin that is also kernel-served is red", () => {
  const errors = evaluatePlacement({
    ...live,
    catalogPins: [...live.catalogPins, { name: "zod", version: "4.0.0" }],
    catalogEnablingRecipes: [
      ...live.catalogEnablingRecipes,
      { name: "lite/zod-wrap", pinNames: ["zod"] },
    ],
  });
  assert.ok(
    errors.some((error) =>
      error.includes('catalog pin "zod" is also a kernel served package')
    )
  );
});

test("catalog pin without a recipe on-ramp is red", () => {
  const errors = evaluatePlacement({
    ...live,
    catalogPins: [...live.catalogPins, { name: "papaparse", version: "5.0.0" }],
  });
  assert.ok(
    errors.some((error) =>
      error.includes('catalog pin "papaparse" has no recipe on-ramp')
    )
  );
});

test("the same catalog-enabling recipe on two starters is red", () => {
  const errors = evaluatePlacement({
    ...live,
    starters: [
      { starter: "base", recipes: ["lite/pdf-invoice"] },
      { starter: "erp", recipes: ["lite/pdf-invoice"] },
      { starter: "heavy", recipes: ["lite/utils"] },
    ],
  });
  assert.ok(
    errors.some((error) =>
      error.includes(
        'catalog-enabling recipe "lite/pdf-invoice" is seeded by base and erp'
      )
    )
  );
});
