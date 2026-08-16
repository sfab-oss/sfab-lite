import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatIndexHtml,
  generateFormatFiles,
} from "./generate-format-files.ts";
import { GENERATED_ARTIFACTS, MANIFEST_FORMAT } from "./manifest.ts";

const NO_PINS = { dependencies: {}, devDependencies: {} };

function validManifest() {
  return {
    format: MANIFEST_FORMAT,
    name: "erp",
    runtime: "^0",
    adapter: "cloudflare" as const,
    root: "app",
    server: { entry: "src/server.ts", exportName: "app" },
    client: { entry: "src/router.tsx", styles: "src/styles.css" },
    html: "index.html",
    safelist: "safelist.txt",
    migrations: "migrations",
    schema: "src/db/schema.ts",
    inject: {},
    source: {
      dirs: ["src"],
      extensions: [".ts"],
      files: ["package.json"],
      exclude: [],
    },
    capabilities: [],
    modules: [],
    recipes: {},
  };
}

test("generateFormatFiles emits the RFC paths including the db shim", () => {
  const files = generateFormatFiles(validManifest(), NO_PINS);
  assert.deepEqual(Object.keys(files).sort(), [
    GENERATED_ARTIFACTS.componentsJson,
    GENERATED_ARTIFACTS.indexHtml,
    GENERATED_ARTIFACTS.packageJson,
    GENERATED_ARTIFACTS.dbIndex,
    GENERATED_ARTIFACTS.tsconfig,
  ]);
});

test("the cloudflare db shim exports createDb and Db over drizzle-orm/d1", () => {
  const files = generateFormatFiles(validManifest(), NO_PINS);
  const shim = files[GENERATED_ARTIFACTS.dbIndex] ?? "";
  assert.ok(shim.includes('from "drizzle-orm/d1"'));
  assert.ok(shim.includes("export function createDb"));
  assert.ok(shim.includes("export type Db"));
  assert.ok(shim.includes("drizzle(env.DB, { schema })"));
});

test("package.json takes name and exact pins, no ranges", () => {
  const files = generateFormatFiles(validManifest(), {
    dependencies: { "react-dom": "19.2.8", react: "19.2.8" },
    devDependencies: { vite: "7.0.6", typescript: "6.0.3" },
  });
  const pkg = JSON.parse(files[GENERATED_ARTIFACTS.packageJson] ?? "{}");
  assert.equal(pkg.name, "erp");
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, "module");
  assert.deepEqual(pkg.scripts, {
    typecheck: "tsc --noEmit",
    lint: "biome check .",
    dev: "vite",
    build: "vite build",
  });
  assert.deepEqual(pkg.dependencies, {
    react: "19.2.8",
    "react-dom": "19.2.8",
  });
  assert.deepEqual(pkg.devDependencies, {
    typescript: "6.0.3",
    vite: "7.0.6",
  });
  const text = files[GENERATED_ARTIFACTS.packageJson] ?? "";
  assert.equal(text.includes("^"), false);
  assert.equal(text.includes("~"), false);
});

test("tsconfig keeps types: [] and include: src", () => {
  const files = generateFormatFiles(validManifest(), NO_PINS);
  const tsconfig = JSON.parse(files[GENERATED_ARTIFACTS.tsconfig] ?? "{}");
  assert.deepEqual(tsconfig.compilerOptions.types, []);
  assert.deepEqual(tsconfig.include, ["src"]);
});

test("index.html is the shared shell without the host import map", () => {
  const files = generateFormatFiles(validManifest(), NO_PINS);
  const html = files[GENERATED_ARTIFACTS.indexHtml] ?? "";
  assert.ok(html.includes("<title>erp</title>"));
  assert.ok(html.includes('<link rel="icon" href="data:,">'));
  assert.ok(html.includes('<div id="root"></div>'));
  assert.ok(
    html.includes('<script type="module" src="/src/router.tsx"></script>')
  );
  assert.equal(html.includes("importmap"), false);
});

test("components.json locks @lite as the only registry", () => {
  const files = generateFormatFiles(validManifest(), NO_PINS);
  const components = JSON.parse(
    files[GENERATED_ARTIFACTS.componentsJson] ?? "{}"
  );
  assert.deepEqual(Object.keys(components.registries), ["@lite"]);
  assert.equal(
    components.registries["@lite"],
    "https://lite.sfab.dev/r/{name}.json"
  );
});

test("formatIndexHtml injects stylesheet and import map for pack", () => {
  const html = formatIndexHtml({
    title: "sfab-lite",
    scriptSrc: "./assets/app.js",
    stylesheetHref: "./assets/app.css",
    importMap: { react: "/kernel/0.4.0/client/react.js" },
  });
  assert.ok(html.includes('<link rel="stylesheet" href="./assets/app.css">'));
  assert.ok(html.includes('type="importmap"'));
  assert.ok(html.includes("/kernel/0.4.0/client/react.js"));
  assert.ok(html.includes('src="./assets/app.js"'));
});
