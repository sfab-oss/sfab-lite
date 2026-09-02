#!/usr/bin/env node
/**
 * Workspace integrity: product scaffolds + shared tooling packages exist.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PINS,
  STANDALONE_TOOL_PINS,
  UNIVERSE_EXTRA_PINS,
} from "../framework/runtime/scripts/pins.mjs";

const root = new URL("..", import.meta.url).pathname;

const products = [
  ["factory/host", "@sfab-lite/factory", "src/server.ts"],
  ["factory/check", "@sfab-lite/check"],
  ["factory/lint", "@sfab-lite/lint"],
  ["factory/build", "@sfab-lite/build"],
  ["framework/verbs", "@sfab-lite/verbs"],
  ["starters/erp", "@sfab-lite/starter-erp"],
  ["starters/base", "@sfab-lite/starter-base"],
  ["starters/heavy", "@sfab-lite/starter-heavy"],
  ["framework/runtime", "@sfab-lite/kernel"],
  ["framework/toolchain", "@sfab-lite/core"],
  ["registry", "@sfab-lite/registry"],
];

const tooling = [
  ["framework/tsconfig", "@sfab-lite/tsconfig"],
  ["framework/biome-config", "@sfab-lite/biome-config"],
];

let failed = false;

for (const [dir, name, entryRel = "src/index.ts"] of products) {
  const base = join(root, dir);
  const pkgPath = join(base, "package.json");
  const entry = join(base, entryRel);
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
if (
  !(
    workspace.includes("framework/*") &&
    workspace.includes("registry") &&
    workspace.includes("starters/*") &&
    workspace.includes("factory/*")
  )
) {
  console.error(
    "pnpm-workspace.yaml must include framework/*, registry, starters/*, factory/*"
  );
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

// Each starter manifest is the factory's map of that seed payload. When a
// declared path stops existing, the failure otherwise surfaces as a broken
// build long after the rename that caused it.
const starterDirs = products
  .filter(([dir]) => dir.startsWith("starters/"))
  .map(([dir]) => dir);

let declaredCount = 0;
const runtimePins = {
  ...PINS,
  ...UNIVERSE_EXTRA_PINS,
  ...STANDALONE_TOOL_PINS,
};

for (const starterDir of starterDirs) {
  const templateRoot = join(root, starterDir);
  const manifest = JSON.parse(
    readFileSync(join(templateRoot, "manifest.json"), "utf8")
  );
  const appRoot = join(templateRoot, manifest.root);
  const declared = [
    manifest.server.entry,
    manifest.client.entry,
    manifest.client.styles,
    manifest.html,
    manifest.safelist,
    manifest.migrations,
    manifest.schema,
    ...manifest.source.dirs,
    ...manifest.source.files,
    ...manifest.source.exclude,
  ];
  declaredCount += declared.length;
  for (const path of declared) {
    if (!existsSync(join(appRoot, path))) {
      console.error(`${starterDir} manifest points at a missing path: ${path}`);
      failed = true;
    }
  }

  for (const [dest, src] of Object.entries(manifest.inject ?? {})) {
    const abs = join(templateRoot, src);
    if (!existsSync(abs)) {
      console.error(`${starterDir} inject source missing: ${dest} ← ${src}`);
      failed = true;
    }
  }

  // Starter conforms to the runtime's pins — never the reverse.
  const starterPkg = JSON.parse(
    readFileSync(join(templateRoot, "package.json"), "utf8")
  );
  const starterPins = {
    ...starterPkg.dependencies,
    ...starterPkg.devDependencies,
  };
  for (const [name, version] of Object.entries(runtimePins)) {
    if (name === "esbuild") {
      continue;
    }
    const got = starterPins[name];
    if (got == null) {
      console.error(
        `${starterDir}/package.json missing runtime pin ${name}@${version}`
      );
      failed = true;
    } else if (got !== version) {
      console.error(
        `${starterDir}/package.json pins ${name}@${got}; runtime owns ${version}`
      );
      failed = true;
    }
  }
}

// One TypeScript across the repo, and it is the kernel's. The kernel ships
// a specific compiler's lib/*.d.ts inside TYPES_VFS, so factory/check must match
// it exactly or the check worker typechecks apps against libs it did not
// build. Letting the rest of the repo drift to a different major is what
// produced five different pins across seven packages. TypeScript 7 is not
// used in this repo.
const universePkg = JSON.parse(
  readFileSync(join(root, "framework/runtime/universe/package.json"), "utf8")
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
  console.error("framework/runtime/universe must pin typescript");
  failed = true;
}

if (failed) {
  process.exit(1);
}
console.log(
  `workspace ok: ${products.length} products + ${tooling.length} tooling, ${declaredCount} starter paths, typescript ${KERNEL_TS}`
);
