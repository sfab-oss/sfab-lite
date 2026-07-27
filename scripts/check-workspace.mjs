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

// The template manifest is the factory's only map of the seed payload. When
// a declared path stops existing, the failure otherwise surfaces as a broken
// build — or, in the exploration's case, a silent fallback — long after the
// rename that caused it.
const templateRoot = join(root, "packages/template");
const manifest = JSON.parse(
  readFileSync(join(templateRoot, "manifest.json"), "utf8")
);
const appRoot = join(templateRoot, manifest.root);
const declared = [
  manifest.server.entry,
  manifest.client.entry,
  manifest.client.styles,
  manifest.safelist,
  manifest.migrations,
  manifest.schema,
  ...manifest.source.dirs,
  ...manifest.source.files,
  ...manifest.source.exclude,
];
for (const path of declared) {
  if (!existsSync(join(appRoot, path))) {
    console.error(`template manifest points at a missing path: ${path}`);
    failed = true;
  }
}

// One TypeScript across the repo, and it is the kernel's. The kernel ships
// a specific compiler's lib/*.d.ts inside TYPES_VFS, so apps/check must match
// it exactly or the check worker typechecks apps against libs it did not
// build. Letting the rest of the repo drift to a different major is what
// produced five different pins across seven packages. TypeScript 7 is not
// used in this repo.
const universePkg = JSON.parse(
  readFileSync(join(root, "packages/kernel/universe/package.json"), "utf8")
);
const KERNEL_TS =
  universePkg.dependencies?.typescript ??
  universePkg.devDependencies?.typescript;

if (KERNEL_TS) {
  const pkgPaths = [
    "package.json",
    ...products.map(([dir]) => join(dir, "package.json")),
  ];
  for (const rel of pkgPaths) {
    const pkg = JSON.parse(readFileSync(join(root, rel), "utf8"));
    const pin = pkg.dependencies?.typescript ?? pkg.devDependencies?.typescript;
    if (pin == null) {
      continue;
    }
    if (pin !== KERNEL_TS) {
      console.error(
        `${rel} pins typescript ${pin}; must be exactly ${KERNEL_TS} (the kernel's)`
      );
      failed = true;
    }
  }
} else {
  console.error("packages/kernel/universe must pin typescript");
  failed = true;
}

if (failed) {
  process.exit(1);
}
console.log(
  `workspace ok: ${products.length} products + ${tooling.length} tooling, ${declared.length} template paths, typescript ${KERNEL_TS}`
);
