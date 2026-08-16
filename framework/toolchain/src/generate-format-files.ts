/**
 * Host-generated format members: package.json, tsconfig.json, index.html,
 * components.json, src/db/index.ts. One function; starter and host both
 * consume it.
 *
 * See `docs/architecture/APP-FORMAT.md` §4.
 */

import type { ManifestV0 } from "./manifest.js";

export interface FormatPins {
  dependencies: Readonly<Record<string, string>>;
  devDependencies: Readonly<Record<string, string>>;
}

const CLOUDFLARE_DB_SHIM = `import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../env";
// biome-ignore lint/performance/noNamespaceImport: drizzle's relational query builder takes the whole schema module as one object.
import * as schema from "./schema";

export function createDb(env: Env) {
  return drizzle(env.DB, { schema });
}

export type Db = ReturnType<typeof createDb>;
`;

export interface FormatPins {
  dependencies: Readonly<Record<string, string>>;
  devDependencies: Readonly<Record<string, string>>;
}

const LITE_REGISTRY_URL = "https://lite.sfab.dev/r/{name}.json";
const LEADING_SLASHES = /^\/+/;

const TSCONFIG_JSON = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "verbatimModuleSyntax": true,
    "types": [],
    "allowImportingTsExtensions": true
  },
  "include": ["src"]
}
`;

const COMPONENTS_JSON = {
  $schema: "https://ui.shadcn.com/schema.json",
  style: "base-vega",
  rsc: false,
  tsx: true,
  tailwind: {
    config: "",
    css: "src/styles.css",
    baseColor: "neutral",
    cssVariables: true,
  },
  iconLibrary: "radix",
  aliases: {
    components: "@/components",
    utils: "@/lib/utils",
    ui: "@/components/ui",
    lib: "@/lib",
    hooks: "@/hooks",
  },
  registries: {
    "@lite": LITE_REGISTRY_URL,
  },
};

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Document shell shared by the committed tree (standalone Vite) and the
 * host pack path (import map + compiled asset URLs injected by the caller).
 */
export function formatIndexHtml(opts: {
  title: string;
  scriptSrc: string;
  stylesheetHref?: string;
  importMap?: Record<string, string>;
}): string {
  const extra: string[] = [];
  if (opts.stylesheetHref) {
    extra.push(`    <link rel="stylesheet" href="${opts.stylesheetHref}">`);
  }
  if (opts.importMap) {
    extra.push(
      `    <script type="importmap">${JSON.stringify({ imports: opts.importMap })}</script>`
    );
  }
  const extraBlock = extra.length > 0 ? `${extra.join("\n")}\n` : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(opts.title)}</title>
    <link rel="icon" href="data:,">
${extraBlock}  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${opts.scriptSrc}"></script>
  </body>
</html>
`;
}

function sortedPins(
  pins: Readonly<Record<string, string>>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(pins).sort()) {
    const version = pins[key];
    if (version == null) {
      continue;
    }
    out[key] = version;
  }
  return out;
}

export function generateFormatFiles(
  manifest: ManifestV0,
  pins: FormatPins
): Record<string, string> {
  const entry = manifest.client.entry.replace(LEADING_SLASHES, "");
  const packageJson = {
    name: manifest.name,
    private: true,
    type: "module",
    scripts: {
      typecheck: "tsc --noEmit",
      lint: "biome check .",
      dev: "vite",
      build: "vite build",
    },
    dependencies: sortedPins(pins.dependencies),
    devDependencies: sortedPins(pins.devDependencies),
  };
  return {
    "package.json": `${JSON.stringify(packageJson, null, 2)}\n`,
    "tsconfig.json": TSCONFIG_JSON,
    "index.html": formatIndexHtml({
      title: manifest.name,
      scriptSrc: `/${entry}`,
    }),
    "components.json": `${JSON.stringify(COMPONENTS_JSON, null, 2)}\n`,
    "src/db/index.ts": CLOUDFLARE_DB_SHIM,
  };
}
