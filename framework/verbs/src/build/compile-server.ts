/**
 * In-worker server compile via worker-bundler + kernel externals.
 * Server entry + export name come from the tree's manifest.
 */
import type { ManifestV0 } from "@sfab-lite/core";
import {
  catalogEntry,
  catalogLoaderKey,
} from "@sfab-lite/core/catalog-modules";
import { createWorker } from "@cloudflare/worker-bundler";
import {
  KERNEL_PATHS,
  KERNEL_VERSION,
  SERVER_SURFACE_HASH,
} from "@sfab-lite/kernel";
import type { OverlaidTree } from "../format/overlay-format-files.js";

const KERNEL_EXTERNALS = Object.values(KERNEL_PATHS);

function reexport(flat: string, withDefault: boolean): string {
  const star = `export * from ${JSON.stringify(flat)};`;
  if (!withDefault) {
    return star;
  }
  return `${star} export { default } from ${JSON.stringify(flat)};`;
}

/**
 * Bare npm → flat LOADER keys (same map serve.ts mounts).
 * `hono/*` subpaths reexport from hono.js — the kernel vendor entry exports
 * factory + validator onto that same chunk (prebuild already maps hono/* → hono.js).
 */
const KERNEL_VIRTUAL_MODULES: Record<string, string> = {
  react: reexport(KERNEL_PATHS.react, true),
  "react/jsx-runtime": reexport(KERNEL_PATHS.jsxRuntime, true),
  "react-dom": reexport(KERNEL_PATHS.reactDom, true),
  "react-dom/server": reexport(KERNEL_PATHS.reactDomServer, true),
  "drizzle-orm": reexport(KERNEL_PATHS.drizzle, false),
  "drizzle-orm/sql": reexport(KERNEL_PATHS.drizzle, false),
  "drizzle-orm/sqlite-core": reexport(KERNEL_PATHS.drizzle, false),
  "drizzle-orm/d1": reexport(KERNEL_PATHS.drizzle, false),
  "better-auth": reexport(KERNEL_PATHS.betterAuth, false),
  "better-auth/adapters/drizzle": reexport(KERNEL_PATHS.betterAuth, false),
  "better-auth/plugins": reexport(KERNEL_PATHS.betterAuth, false),
  hono: reexport(KERNEL_PATHS.hono, false),
  "hono/factory": reexport(KERNEL_PATHS.hono, false),
  "hono/validator": reexport(KERNEL_PATHS.hono, false),
  zod: reexport(KERNEL_PATHS.zod, false),
};

const SERVER_ENTRY = "src/__sfab_server_entry.ts";

function serverEntrySource(tree: OverlaidTree): string {
  const entry = tree.manifest.server.entry;
  if (!entry.startsWith("src/")) {
    throw new Error(`compileServer: server.entry must be under src/: ${entry}`);
  }
  const relativeFromSynthetic = `./${entry.slice("src/".length)}`;
  const exportName = tree.manifest.server.exportName;
  return `
import { ${exportName} } from ${JSON.stringify(relativeFromSynthetic)};

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    return ${exportName}.fetch(request, env as never, ctx as never);
  },
};
`.trim();
}

function pickMainJs(result: Awaited<ReturnType<typeof createWorker>>): string {
  const mod = result.modules[result.mainModule];
  if (typeof mod === "string") {
    return mod;
  }
  if (
    mod &&
    typeof mod === "object" &&
    "js" in mod &&
    typeof (mod as { js?: string }).js === "string"
  ) {
    return (mod as { js: string }).js;
  }
  throw new Error(`No JS for mainModule ${result.mainModule}`);
}

/** Normalize worker-bundler output to flat kernel keys (seed does the same). */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeFlatImports(
  source: string,
  extraVirtualModules: Record<string, string> = {}
): string {
  let out = source
    .replace(/from\s+["']hono(?:\/[^"']*)?["']/g, 'from "hono.js"')
    .replace(
      /from\s+["']drizzle-orm(?:\/[^"']*)?["']/g,
      'from "drizzle-orm.js"'
    )
    .replace(
      /from\s+["']better-auth(?:\/[^"']*)?["']/g,
      'from "better-auth.js"'
    )
    .replace(/from\s+["']zod(?:\/[^"']*)?["']/g, 'from "zod.js"')
    .replace(/from\s+["']react["']/g, 'from "react.js"')
    .replace(/from\s+["']react\/jsx-runtime["']/g, 'from "jsx-runtime.js"')
    .replace(/from\s+["']react-dom["']/g, 'from "react-dom.js"')
    .replace(/from\s+["']react-dom\/server["']/g, 'from "react-dom-server.js"');
  for (const [bare, stub] of Object.entries(extraVirtualModules)) {
    const from = stub.match(/from\s+("[^"]+")/)?.[1];
    if (!from) {
      continue;
    }
    out = out.replace(
      new RegExp(`from\\s+["']${escapeRegExp(bare)}["']`, "g"),
      `from ${from}`
    );
  }
  return out;
}

/**
 * Bundle app sources against the kernel import map.
 *
 * Shared with the schema probe, which compiles a different entry over the same
 * files. Duplicating the externals and virtual-module maps would let the two
 * drift, and a probe resolving `drizzle-orm` differently than the server does
 * is a probe reporting a schema the app will not actually get.
 */
export async function bundleWithKernel(
  files: Record<string, string>,
  entryPoint: string,
  extraExternals: string[] = [],
  extraVirtualModules: Record<string, string> = {}
): Promise<{ js: string; mainModule: string; warnings: unknown[] }> {
  const result = await createWorker({
    files,
    entryPoint,
    bundle: true,
    externals: [...KERNEL_EXTERNALS, ...extraExternals],
    virtualModules: { ...KERNEL_VIRTUAL_MODULES, ...extraVirtualModules },
    jsx: "transform",
  });
  return {
    js: normalizeFlatImports(pickMainJs(result), extraVirtualModules),
    mainModule: result.mainModule,
    warnings: result.warnings ?? [],
  };
}

export interface CompileServerResult {
  serverBundle: string;
  compileMs: number;
  kernelVersion: string;
  serverSurfaceHash: string;
  mainModule: string;
  warnings: unknown[];
}

export function catalogServerExtras(manifest: ManifestV0): {
  externals: string[];
  virtualModules: Record<string, string>;
} {
  const externals: string[] = [];
  const virtualModules: Record<string, string> = {};
  for (const declared of manifest.modules) {
    const entry = catalogEntry(declared.name, declared.version);
    if (entry?.plane !== "server") {
      continue;
    }
    const loaderKey = catalogLoaderKey(declared.name);
    if (!loaderKey) {
      continue;
    }
    externals.push(loaderKey);
    virtualModules[declared.name] = reexport(
      loaderKey,
      entry.reexportDefault === true
    );
  }
  return { externals, virtualModules };
}

/**
 * Compile sub-app server from source files (keys like `src/server.ts`).
 */
export async function compileServer(
  tree: OverlaidTree
): Promise<CompileServerResult> {
  const sourceFiles = tree.files;
  const entry = tree.manifest.server.entry;
  if (!(entry in sourceFiles)) {
    throw new Error(`compileServer: missing server entry ${entry}`);
  }

  const files: Record<string, string> = { ...sourceFiles };
  // Synthetic entry — host serves assets; LOADER only runs the Hono API.
  files[SERVER_ENTRY] = serverEntrySource(tree);

  const extras = catalogServerExtras(tree.manifest);
  const t0 = performance.now();
  const bundled = await bundleWithKernel(
    files,
    SERVER_ENTRY,
    extras.externals,
    extras.virtualModules
  );
  const compileMs = performance.now() - t0;

  return {
    serverBundle: bundled.js,
    compileMs,
    kernelVersion: KERNEL_VERSION,
    serverSurfaceHash: SERVER_SURFACE_HASH,
    mainModule: bundled.mainModule,
    warnings: bundled.warnings,
  };
}
