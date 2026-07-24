#!/usr/bin/env node
/**
 * Workspace integrity: product scaffolds + shared tooling packages exist.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

const products = [
  ["apps/factory", "@sfab-lite/factory"],
  ["apps/check", "@sfab-lite/check"],
  ["apps/lint", "@sfab-lite/lint"],
  ["packages/template", "@sfab-lite/template"],
  ["packages/kernel", "@sfab-lite/kernel"],
  ["packages/core", "@sfab-lite/core"],
];

const tooling = [
  ["packages/tsconfig", "@sfab-lite/tsconfig"],
  ["packages/biome-config", "@sfab-lite/biome-config"],
];

let failed = false;

for (const [dir, name] of products) {
  const base = join(root, dir);
  const pkgPath = join(base, "package.json");
  const entry = join(base, "src", "index.ts");
  const tsconfig = join(base, "tsconfig.json");
  if (!(existsSync(pkgPath) && existsSync(entry) && existsSync(tsconfig))) {
    console.error(`missing product scaffold: ${dir}`);
    failed = true;
    continue;
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (pkg.name !== name) {
    console.error(`name mismatch in ${dir}: got ${pkg.name}, want ${name}`);
    failed = true;
  }
}

for (const [dir, name] of tooling) {
  const pkgPath = join(root, dir, "package.json");
  if (!existsSync(pkgPath)) {
    console.error(`missing tooling package: ${dir}`);
    failed = true;
    continue;
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (pkg.name !== name) {
    console.error(`name mismatch in ${dir}: got ${pkg.name}, want ${name}`);
    failed = true;
  }
}

const workspace = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
if (!(workspace.includes("apps/*") && workspace.includes("packages/*"))) {
  console.error("pnpm-workspace.yaml must include apps/* and packages/*");
  failed = true;
}

const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
for (const dep of ["@sfab-lite/tsconfig", "@sfab-lite/biome-config"]) {
  if (!rootPkg.devDependencies?.[dep]) {
    console.error(`root package.json missing devDependency ${dep}`);
    failed = true;
  }
}

if (!existsSync(join(root, "biome.jsonc"))) {
  console.error("missing root biome.jsonc");
  failed = true;
}

if (failed) {
  process.exit(1);
}
console.log(
  `workspace ok: ${products.length} products + ${tooling.length} tooling`
);
