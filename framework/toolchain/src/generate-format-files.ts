/**
 * Host-generated format members: package.json, tsconfig.json, index.html,
 * components.json, src/db/index.ts, and src/storage/index.ts when
 * `capabilities` includes `"storage"`. One function; starter and host both
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

const CLOUDFLARE_STORAGE_SHIM = `export interface StoragePutOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface StorageObject {
  body: ReadableStream;
  size: number;
  etag: string;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface StorageHead {
  size: number;
  etag: string;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface StorageListItem {
  key: string;
  size: number;
  etag: string;
  uploaded: Date;
}

export interface StorageListResult {
  objects: StorageListItem[];
  cursor?: string;
  truncated: boolean;
}

export interface Storage {
  put: (
    key: string,
    body: ReadableStream | ArrayBuffer | string,
    options?: StoragePutOptions
  ) => Promise<void>;
  get: (key: string) => Promise<StorageObject | null>;
  head: (key: string) => Promise<StorageHead | null>;
  delete: (key: string | string[]) => Promise<void>;
  list: (options?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }) => Promise<StorageListResult>;
}

interface StorageR2Object {
  body: ReadableStream;
  size: number;
  etag: string;
  uploaded: Date;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

interface StorageR2Listed {
  key: string;
  size: number;
  etag: string;
  uploaded: Date;
}

interface StorageR2 {
  put: (
    key: string,
    value: ReadableStream | ArrayBuffer | string,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    }
  ) => Promise<unknown>;
  get: (key: string) => Promise<StorageR2Object | null>;
  head: (key: string) => Promise<Omit<StorageR2Object, "body"> | null>;
  delete: (keys: string | string[]) => Promise<void>;
  list: (options?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }) => Promise<{
    objects: StorageR2Listed[];
    truncated: boolean;
    cursor?: string;
  }>;
}

export function createStorage(env: { STORAGE: StorageR2 }): Storage {
  const bucket = env.STORAGE;
  return {
    async put(key, body, options) {
      await bucket.put(key, body, {
        httpMetadata:
          options?.contentType == null
            ? undefined
            : { contentType: options.contentType },
        customMetadata: options?.metadata,
      });
    },
    async get(key) {
      const obj = await bucket.get(key);
      if (obj == null) {
        return null;
      }
      return {
        body: obj.body,
        size: obj.size,
        etag: obj.etag,
        contentType: obj.httpMetadata?.contentType,
        metadata: obj.customMetadata,
      };
    },
    async head(key) {
      const obj = await bucket.head(key);
      if (obj == null) {
        return null;
      }
      return {
        size: obj.size,
        etag: obj.etag,
        contentType: obj.httpMetadata?.contentType,
        metadata: obj.customMetadata,
      };
    },
    delete(key) {
      return bucket.delete(key);
    },
    async list(options) {
      const listed = await bucket.list({
        prefix: options?.prefix,
        cursor: options?.cursor,
        limit: options?.limit,
      });
      return {
        objects: listed.objects.map((obj) => ({
          key: obj.key,
          size: obj.size,
          etag: obj.etag,
          uploaded: obj.uploaded,
        })),
        cursor: listed.truncated ? listed.cursor : undefined,
        truncated: listed.truncated,
      };
    },
  };
}
`;

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
  const files: Record<string, string> = {
    "package.json": `${JSON.stringify(packageJson, null, 2)}\n`,
    "tsconfig.json": TSCONFIG_JSON,
    "index.html": formatIndexHtml({
      title: manifest.name,
      scriptSrc: `/${entry}`,
    }),
    "components.json": `${JSON.stringify(COMPONENTS_JSON, null, 2)}\n`,
    "src/db/index.ts": CLOUDFLARE_DB_SHIM,
  };
  if (manifest.capabilities.includes("storage")) {
    files["src/storage/index.ts"] = CLOUDFLARE_STORAGE_SHIM;
  }
  return files;
}
