/**
 * In-worker client compile against import-map kernel chunks (option A).
 * Client entry comes from the tree's manifest — never a hardcoded path.
 */
import { createWorker } from "@cloudflare/worker-bundler";
import { formatIndexHtml } from "@sfab-lite/core";
import {
  CLIENT_BAILOUTS,
  CLIENT_IMPORT_MAP,
  CLIENT_KERNEL_FILES,
  KERNEL_VERSION,
} from "@sfab-lite/kernel";
import type { OverlaidTree } from "../format/overlay-format-files.js";

const RELATIVE_PATH_PREFIX_RE = /^\.\//;

function reexport(flat: string, withDefault: boolean): string {
  const star = `export * from ${JSON.stringify(flat)};`;
  if (!withDefault) {
    return star;
  }
  return `${star} export { default } from ${JSON.stringify(flat)};`;
}

/** Build virtualModules + externals from whatever client prebuild succeeded. */
function clientWiring(): {
  externals: string[];
  virtualModules: Record<string, string>;
  flatToBare: Record<string, string>;
} {
  const virtualModules: Record<string, string> = {};
  const externals: string[] = [];
  const flatToBare: Record<string, string> = {};

  for (const [bare, rel] of Object.entries(CLIENT_IMPORT_MAP)) {
    const flat = rel.replace(RELATIVE_PATH_PREFIX_RE, "");
    if (!(flat in CLIENT_KERNEL_FILES)) {
      continue;
    }
    externals.push(flat);
    const withDefault =
      bare === "react" ||
      bare === "react-dom" ||
      bare === "react/jsx-runtime" ||
      bare === "react-dom/client" ||
      bare === "clsx";
    virtualModules[bare] = reexport(flat, withDefault);
    // Prefer first bare mapping for reverse rewrite
    if (!flatToBare[flat]) {
      flatToBare[flat] = bare;
    }
  }
  return { externals: [...new Set(externals)], virtualModules, flatToBare };
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

function rewriteFlatToBare(
  source: string,
  flatToBare: Record<string, string>
): string {
  let out = source;
  for (const [flat, bare] of Object.entries(flatToBare)) {
    const re = new RegExp(`from\\s+["']${flat.replace(/\./g, "\\.")}["']`, "g");
    out = out.replace(re, `from ${JSON.stringify(bare)}`);
  }
  return out;
}

export interface CompileClientResult {
  js: string;
  compileMs: number;
  kernelVersion: string;
  bailouts: string[];
}

export async function compileClient(
  tree: OverlaidTree
): Promise<CompileClientResult> {
  const sourceFiles = tree.files;
  const entry = tree.manifest.client.entry;
  const files: Record<string, string> = { ...sourceFiles };
  const entrySrc = files[entry];
  if (entrySrc == null) {
    throw new Error(`compileClient: missing client entry ${entry}`);
  }
  // CSS is compiled separately; strip the side-effect import from the JS entry.
  files[entry] = entrySrc.replace(/import\s+["']\.\/styles\.css["'];?\s*/g, "");

  const { externals, virtualModules, flatToBare } = clientWiring();

  const t0 = performance.now();
  const result = await createWorker({
    files,
    entryPoint: entry,
    bundle: true,
    externals,
    virtualModules,
    // Automatic runtime — template sources do not import React for JSX, so
    // classic "transform" leaves React.createElement unbound at runtime.
    jsx: "automatic",
    conditions: ["import", "module", "browser", "default"],
  });
  const compileMs = performance.now() - t0;
  let js = pickMainJs(result);
  js = rewriteFlatToBare(js, flatToBare);

  return {
    js,
    compileMs,
    kernelVersion: KERNEL_VERSION,
    bailouts: [...CLIENT_BAILOUTS],
  };
}

function buildImportMap(kernelVersion: string): Record<string, string> {
  const base = `/kernel/${encodeURIComponent(kernelVersion)}/client`;
  const map: Record<string, string> = {};
  for (const [bare, rel] of Object.entries(CLIENT_IMPORT_MAP)) {
    const flat = rel.replace(RELATIVE_PATH_PREFIX_RE, "");
    if (flat in CLIENT_KERNEL_FILES) {
      const url = `${base}/${flat}`;
      map[bare] = url;
      // Kernel chunks import each other as bare flat filenames (`react.js`).
      // Those are not package names — map them too or the browser throws
      // "Failed to resolve module specifier" and #root stays empty.
      map[flat] = url;
    }
  }
  return map;
}

export function buildIndexHtml(opts: {
  kernelVersion: string;
  title?: string;
}): string {
  return formatIndexHtml({
    title: opts.title ?? "sfab-lite",
    scriptSrc: "./assets/app.js",
    stylesheetHref: "./assets/app.css",
    importMap: buildImportMap(opts.kernelVersion),
  });
}
