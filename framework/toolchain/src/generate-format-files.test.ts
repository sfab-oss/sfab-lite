import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatIndexHtml,
  generateFormatFiles,
} from "./generate-format-files.ts";
import { GENERATED_ARTIFACTS, MANIFEST_FORMAT } from "./manifest.ts";

const NO_PINS = { dependencies: {}, devDependencies: {} };
const REGISTRY_URL = "https://lite.sfab.dev/r/{name}.json";

function generate(
  manifest = validManifest(),
  pins = NO_PINS,
  registryUrl = REGISTRY_URL
) {
  return generateFormatFiles(manifest, pins, { registryUrl });
}

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
  const files = generate();
  assert.deepEqual(Object.keys(files).sort(), [
    GENERATED_ARTIFACTS.componentsJson,
    GENERATED_ARTIFACTS.indexHtml,
    GENERATED_ARTIFACTS.packageJson,
    GENERATED_ARTIFACTS.dbIndex,
    GENERATED_ARTIFACTS.tsconfig,
  ]);
});

test("the cloudflare db shim takes DbEnv, not the app Env", () => {
  const files = generate();
  const shim = files[GENERATED_ARTIFACTS.dbIndex] ?? "";
  assert.ok(shim.includes('from "drizzle-orm/d1"'));
  assert.ok(shim.includes("export interface DbEnv"));
  assert.ok(shim.includes("export function createDb"));
  assert.ok(shim.includes("export type Db"));
  assert.ok(shim.includes("drizzle(env.DB, { schema })"));
  assert.equal(shim.includes('from "../env"'), false);
});

test("storage shim is omitted unless capabilities includes storage", () => {
  const files = generate();
  assert.equal(files[GENERATED_ARTIFACTS.storageIndex], undefined);
});

test("storage shim is emitted when capabilities includes storage", () => {
  const files = generate({ ...validManifest(), capabilities: ["storage"] });
  const shim = files[GENERATED_ARTIFACTS.storageIndex] ?? "";
  assert.ok(shim.includes("export function createStorage"));
  assert.ok(shim.includes("export interface Storage"));
  assert.ok(shim.includes("env.STORAGE"));
});

test("package.json takes name and exact pins, no ranges", () => {
  const files = generate(validManifest(), {
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

test("package.json merges manifest.modules at the exact catalog version", () => {
  const files = generate(
    {
      ...validManifest(),
      modules: [{ name: "pdf-lib", version: "1.17.1" }],
    },
    {
      dependencies: { react: "19.2.8" },
      devDependencies: {},
    }
  );
  const pkg = JSON.parse(files[GENERATED_ARTIFACTS.packageJson] ?? "{}");
  assert.deepEqual(pkg.dependencies, {
    "pdf-lib": "1.17.1",
    react: "19.2.8",
  });
  assert.equal(JSON.stringify(pkg.dependencies).includes("^"), false);
});

test("modules: [] leaves generated dependencies unchanged", () => {
  const files = generate(validManifest(), {
    dependencies: { react: "19.2.8" },
    devDependencies: {},
  });
  const pkg = JSON.parse(files[GENERATED_ARTIFACTS.packageJson] ?? "{}");
  assert.deepEqual(pkg.dependencies, { react: "19.2.8" });
});

test("tsconfig keeps types: [] and include: src", () => {
  const files = generate();
  const tsconfig = JSON.parse(files[GENERATED_ARTIFACTS.tsconfig] ?? "{}");
  assert.deepEqual(tsconfig.compilerOptions.types, []);
  assert.deepEqual(tsconfig.include, ["src"]);
});

test("index.html is the shared shell without the host import map", () => {
  const files = generate();
  const html = files[GENERATED_ARTIFACTS.indexHtml] ?? "";
  assert.ok(html.includes("<title>erp</title>"));
  assert.ok(html.includes('<link rel="icon" href="data:,">'));
  assert.ok(html.includes('<div id="root"></div>'));
  assert.ok(
    html.includes('<script type="module" src="/src/router.tsx"></script>')
  );
  assert.equal(html.includes("importmap"), false);
});

test("components.json uses the caller-supplied registry URL as the only registry", () => {
  const files = generate(
    validManifest(),
    NO_PINS,
    "https://example.test/r/{name}.json"
  );
  const components = JSON.parse(
    files[GENERATED_ARTIFACTS.componentsJson] ?? "{}"
  );
  assert.deepEqual(Object.keys(components.registries), ["@lite"]);
  assert.equal(
    components.registries["@lite"],
    "https://example.test/r/{name}.json"
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
  assert.ok(html.includes("sfab-theme"));
  assert.ok(html.includes('classList.toggle("dark"'));
});
