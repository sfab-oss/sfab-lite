/**
 * In-worker server compile via worker-bundler + kernel externals.
 * Server entry + export name come from TEMPLATE_MANIFEST.
 */
import { createWorker } from "@cloudflare/worker-bundler";
import { KERNEL_VERSION } from "@sfab-lite/kernel";
import { TEMPLATE_MANIFEST } from "@sfab-lite/template";

const KERNEL_PATHS = {
  react: "react.js",
  jsxRuntime: "jsx-runtime.js",
  reactDom: "react-dom.js",
  reactDomServer: "react-dom-server.js",
  drizzle: "drizzle-orm.js",
  betterAuth: "better-auth.js",
  hono: "hono.js",
  zod: "zod.js",
} as const;

const KERNEL_EXTERNALS = Object.values(KERNEL_PATHS);

function reexport(flat: string, withDefault: boolean): string {
  const star = `export * from ${JSON.stringify(flat)};`;
  if (!withDefault) {
    return star;
  }
  return `${star} export { default } from ${JSON.stringify(flat)};`;
}

/** Bare npm → flat LOADER keys (same map serve.ts mounts). */
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
  // S1 template uses these subpaths; the frozen hono.js chunk is main-only.
  // Provide small inlined shims so they compile into the server bundle
  // instead of being rewritten onto hono.js (which lacks the exports).
  "hono/factory": `
export const createMiddleware = (middleware) => middleware;
export const createFactory = () => ({ createMiddleware });
export class Factory {
  createMiddleware = createMiddleware;
}
`.trim(),
  "hono/validator": `
const jsonRegex = /^application\\/([a-z-.]+\\+)?json/i;
export const validator = (target, validationFunc) => {
  return async (c, next) => {
    let value = {};
    if (target === "json") {
      const contentType = c.req.header("Content-Type");
      if (contentType && jsonRegex.test(contentType)) {
        try {
          value = await c.req.json();
        } catch {
          return c.json({ error: "Malformed JSON in request body" }, 400);
        }
      }
    } else {
      throw new Error(
        "hono/validator shim: only json target is supported (got " + target + ")"
      );
    }
    const res = await validationFunc(value, c);
    if (res instanceof Response) return res;
    c.req.addValidatedData(target, res);
    return await next();
  };
};
`.trim(),
  zod: reexport(KERNEL_PATHS.zod, false),
};

const SERVER_ENTRY = "src/__sfab_server_entry.ts";

function serverEntrySource(): string {
  const entry = TEMPLATE_MANIFEST.server.entry;
  if (!entry.startsWith("src/")) {
    throw new Error(`compileServer: server.entry must be under src/: ${entry}`);
  }
  const relativeFromSynthetic = `./${entry.slice("src/".length)}`;
  const exportName = TEMPLATE_MANIFEST.server.exportName;
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
function normalizeFlatImports(source: string): string {
  // Do not rewrite hono/factory|validator — those are inlined via virtualModules.
  return source
    .replace(/from\s+["']hono["']/g, 'from "hono.js"')
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
}

export type CompileServerResult = {
  serverBundle: string;
  compileMs: number;
  kernelVersion: string;
  mainModule: string;
  warnings: unknown[];
};

/**
 * Compile sub-app server from source files (keys like `src/hono/index.ts`).
 */
export async function compileServer(
  sourceFiles: Record<string, string>
): Promise<CompileServerResult> {
  const entry = TEMPLATE_MANIFEST.server.entry;
  if (!(entry in sourceFiles)) {
    throw new Error(`compileServer: missing server entry ${entry}`);
  }

  const files: Record<string, string> = { ...sourceFiles };
  // Synthetic entry — host serves assets; LOADER only runs the Hono API.
  files[SERVER_ENTRY] = serverEntrySource();

  const t0 = performance.now();
  const result = await createWorker({
    files,
    entryPoint: SERVER_ENTRY,
    bundle: true,
    externals: [...KERNEL_EXTERNALS],
    virtualModules: KERNEL_VIRTUAL_MODULES,
    jsx: "transform",
  });
  const compileMs = performance.now() - t0;
  let serverBundle = pickMainJs(result);
  serverBundle = normalizeFlatImports(serverBundle);

  return {
    serverBundle,
    compileMs,
    kernelVersion: KERNEL_VERSION,
    mainModule: result.mainModule,
    warnings: result.warnings ?? [],
  };
}
