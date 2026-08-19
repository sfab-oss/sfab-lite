#!/usr/bin/env node
/**
 * Bake registry/generated/catalog.json and registry/published.json from
 * recipes/<slug>/<version>/. --check fails if committed artifacts drift.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { namespacedAddress, serveSlug, validateItem } from "../src/lite.ts";
import { SHADCN_REGISTRY_ITEM_SCHEMA } from "../src/pin.ts";

const registryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const recipesRoot = join(registryRoot, "recipes");
const catalogPath = join(registryRoot, "src/generated/catalog.json");
const publishedPath = join(registryRoot, "published.json");
const sourceRegistryPath = join(registryRoot, "registry.json");
const schemaPath = join(registryRoot, SHADCN_REGISTRY_ITEM_SCHEMA.vendoredPath);
// Hashed in published.json, omitted from catalog.items / registry.json.
const RETIRED_FROM_LIVE = new Set(["form"]);

function hash(text) {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function formatIssues(issues) {
  return issues.map((i) => `  ${i.path || "(root)"}: ${i.message}`).join("\n");
}

const schemaBytes = readFileSync(schemaPath);
const schemaHash = hash(schemaBytes);
if (schemaHash !== SHADCN_REGISTRY_ITEM_SCHEMA.sha256) {
  console.error(
    `bake-catalog — vendored schema hash ${schemaHash} does not match pin ${SHADCN_REGISTRY_ITEM_SCHEMA.sha256}`
  );
  process.exit(1);
}

const catalog = {
  schemaPin: { ...SHADCN_REGISTRY_ITEM_SCHEMA },
  items: {},
};
const published = {};

if (!existsSync(recipesRoot)) {
  console.error("bake-catalog — missing recipes/");
  process.exit(1);
}

for (const slug of readdirSync(recipesRoot).sort()) {
  const slugDir = join(recipesRoot, slug);
  for (const version of readdirSync(slugDir).sort()) {
    const versionDir = join(slugDir, version);
    const itemPath = join(versionDir, "registry-item.json");
    if (!existsSync(itemPath)) {
      console.error(`bake-catalog — missing ${itemPath}`);
      process.exit(1);
    }
    const raw = loadJson(itemPath);
    const result = validateItem(raw);
    if (!result.ok) {
      console.error(
        `bake-catalog — ${slug}@${version} failed lite profile:\n${formatIssues(result.issues)}`
      );
      process.exit(1);
    }
    const item = result.item;
    const contents = {};
    const fileHashes = {
      "registry-item.json": hash(readFileSync(itemPath, "utf8")),
    };
    for (const file of item.files) {
      const abs = join(versionDir, file.path);
      if (!existsSync(abs)) {
        console.error(`bake-catalog — ${item.name} missing ${file.path}`);
        process.exit(1);
      }
      const text = readFileSync(abs, "utf8");
      contents[file.target] = text;
      fileHashes[file.path] = hash(text);
    }
    published[`${item.name}@${version}`] = { files: fileHashes };
    if (RETIRED_FROM_LIVE.has(slug)) {
      continue;
    }
    const current = catalog.items[item.name];
    if (current && current.version > version) {
      continue;
    }
    catalog.items[item.name] = { version, item, contents };
  }
}

const catalogJson = `${JSON.stringify(catalog, null, 2)}\n`;
const publishedJson = `${JSON.stringify(published, null, 2)}\n`;
const sourceItems = Object.entries(catalog.items)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, entry]) => {
    const slug = serveSlug(name);
    return {
      name: slug,
      type: entry.item.type,
      title: entry.item.title,
      description: entry.item.description,
      registryDependencies:
        entry.item.registryDependencies.map(namespacedAddress),
      files: entry.item.files.map((file) => ({
        path: `recipes/${slug}/${entry.version}/${file.path}`,
        type: file.type,
        target: file.target,
      })),
      meta: entry.item.meta,
    };
  });
const sourceRegistryJson = `${JSON.stringify(
  {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "lite",
    homepage: "https://lite.sfab.dev",
    items: sourceItems,
  },
  null,
  2
)}\n`;
const check = process.argv.includes("--check");

if (check) {
  let failed = false;
  const currentCatalog = existsSync(catalogPath)
    ? readFileSync(catalogPath, "utf8")
    : "";
  const currentPublished = existsSync(publishedPath)
    ? readFileSync(publishedPath, "utf8")
    : "";
  const currentSource = existsSync(sourceRegistryPath)
    ? readFileSync(sourceRegistryPath, "utf8")
    : "";
  if (currentCatalog !== catalogJson) {
    console.error(
      "check:registry — generated catalog is stale; run pnpm --filter @sfab-lite/registry bake"
    );
    failed = true;
  }
  if (currentPublished !== publishedJson) {
    console.error(
      "check:registry — published.json is stale; run pnpm --filter @sfab-lite/registry bake"
    );
    failed = true;
  }
  if (currentSource !== sourceRegistryJson) {
    console.error(
      "check:registry — registry.json is stale; run pnpm --filter @sfab-lite/registry bake"
    );
    failed = true;
  }
  if (failed) {
    process.exit(1);
  }
  console.log(
    `registry catalog ok: ${Object.keys(catalog.items).length} recipes, ${Object.keys(published).length} published versions`
  );
  process.exit(0);
}

mkdirSync(dirname(catalogPath), { recursive: true });
writeFileSync(catalogPath, catalogJson);
writeFileSync(publishedPath, publishedJson);
writeFileSync(sourceRegistryPath, sourceRegistryJson);
console.error(
  `bake-catalog: ${Object.keys(catalog.items).length} recipes, ${Object.keys(published).length} versions`
);
