/**
 * In-worker client compile against import-map kernel chunks (option A).
 * @base-ui is intentionally bundled into the app chunk (per-dep B bailout).
 * Client entry comes from TEMPLATE_MANIFEST — never a hardcoded path.
 */
import { createWorker } from "@cloudflare/worker-bundler";
import {
  CLIENT_BAILOUTS,
  CLIENT_IMPORT_MAP,
  CLIENT_KERNEL_FILES,
  KERNEL_VERSION,
} from "@sfab-lite/kernel";
import { TEMPLATE_MANIFEST } from "@sfab-lite/template";

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
    const flat = rel.replace(/^\.\//, "");
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

export type CompileClientResult = {
  js: string;
  compileMs: number;
  kernelVersion: string;
  bailouts: string[];
};

export async function compileClient(
  sourceFiles: Record<string, string>
): Promise<CompileClientResult> {
  const entry = TEMPLATE_MANIFEST.client.entry;
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
    jsx: "transform",
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
    const flat = rel.replace(/^\.\//, "");
    if (flat in CLIENT_KERNEL_FILES) {
      map[bare] = `${base}/${flat}`;
    }
  }
  return map;
}

export function buildIndexHtml(opts: {
  kernelVersion: string;
  title?: string;
}): string {
  const importMap = buildImportMap(opts.kernelVersion);
  const title = opts.title ?? "sfab-lite";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <link rel="stylesheet" href="./assets/app.css" />
    <script type="importmap">${JSON.stringify({ imports: importMap })}</script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./assets/app.js"></script>
  </body>
</html>
`;
}
