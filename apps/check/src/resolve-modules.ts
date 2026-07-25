/**
 * Module resolution against the types VFS (+ per-app overlay).
 */
import { CLIENT_IMPORT_MAP, SERVER_IMPORT_MAP } from "@sfab-lite/kernel";
import { joinPath, normalizePath, readVfs } from "./vfs.js";

/**
 * Every bare specifier the kernel actually serves at runtime.
 *
 * App code may only import from this set. The types VFS is built by a
 * closure prune and therefore ships `.d.ts` for far more subpaths than the
 * import maps cover — 313 of them export runtime values. Without this gate
 * those resolve here, typecheck clean, pass the publish gate, and then throw
 * `Failed to resolve module specifier` in the browser with an empty `#root`.
 * That is the S3.1 failure mode; `@base-ui/react` was one instance of it.
 *
 * Union of both halves rather than per-side: this host checks an app's client
 * and server sources in one program and does not know which half a file
 * compiles into. A client file importing a server-only specifier therefore
 * still passes here — see `docs/architecture/OVERVIEW.md`.
 */
const KERNEL_SERVED: ReadonlySet<string> = new Set([
  ...Object.keys(CLIENT_IMPORT_MAP),
  ...Object.keys(SERVER_IMPORT_MAP),
]);

/**
 * `.d.ts` files inside the VFS reference each other and their transitive
 * dependencies by bare specifier (`better-auth`'s types import `better-call`,
 * which the kernel bundles rather than serves). Those references are internal
 * to the type graph and are not app imports, so they resolve unrestricted.
 *
 * Anchored at the root rather than a substring match: app sources live under
 * `/app/` and their paths come from the caller's overlay, so an app file named
 * `src/node_modules/x.ts` would satisfy a substring test and import anything
 * the VFS happens to type. Only the VFS itself is rooted at `/node_modules/`.
 */
function isVfsInternal(containingFile: string | undefined): boolean {
  return containingFile?.startsWith("/node_modules/") ?? false;
}

const D_TS_TO_D_MTS = /\.d\.ts$/;
const LEADING_DOT_SLASH = /^\.\//;
const JS_SUFFIX = /\.js$/;
const MJS_SUFFIX = /\.mjs$/;

const PACKAGE_ENTRY: Record<string, string> = {
  react: "/node_modules/@types/react/index.d.ts",
  "react/jsx-runtime": "/node_modules/@types/react/jsx-runtime.d.ts",
  "react-dom": "/node_modules/@types/react-dom/index.d.ts",
  "react-dom/client": "/node_modules/@types/react-dom/client.d.ts",
  hono: "/node_modules/hono/dist/types/index.d.ts",
  "hono/client": "/node_modules/hono/dist/types/client/index.d.ts",
  "drizzle-orm": "/node_modules/drizzle-orm/index.d.ts",
  "better-auth": "/node_modules/better-auth/dist/index.d.mts",
  "better-auth/adapters/drizzle":
    "/node_modules/better-auth/dist/adapters/drizzle-adapter/index.d.mts",
  "better-auth/plugins": "/node_modules/better-auth/dist/plugins/index.d.mts",
  "better-auth/react":
    "/node_modules/better-auth/dist/client/react/index.d.mts",
  "better-auth/client/plugins":
    "/node_modules/better-auth/dist/client/plugins/index.d.mts",
  "@tanstack/react-router":
    "/node_modules/@tanstack/react-router/dist/esm/index.d.ts",
  "@tanstack/react-query":
    "/node_modules/@tanstack/react-query/build/modern/index.d.ts",
  clsx: "/node_modules/clsx/clsx.d.ts",
  "class-variance-authority":
    "/node_modules/class-variance-authority/dist/index.d.ts",
  "tailwind-merge": "/node_modules/tailwind-merge/dist/types.d.ts",
  zod: "/node_modules/zod/index.d.ts",
};

const KNOWN_PACKAGES = [
  "drizzle-orm",
  "hono",
  "better-auth",
  "@better-auth/core",
  "@better-auth/utils",
  "@better-auth/drizzle-adapter",
  "better-call",
  "zod",
  "jose",
  "@tanstack/react-router",
  "@tanstack/router-core",
  "@tanstack/react-query",
  "@tanstack/query-core",
  "@base-ui/react",
  "@base-ui/utils",
  "clsx",
  "class-variance-authority",
  "tailwind-merge",
  "@types/react",
  "@types/react-dom",
] as const;

type VfsRead = (p: string) => string | undefined;

function candidatesForPackage(pkg: string, rest: string): string[] {
  const base = `/node_modules/${pkg}`;
  if (!rest) {
    return [
      `${base}/index.d.ts`,
      `${base}/index.d.mts`,
      `${base}/dist/index.d.ts`,
      `${base}/dist/index.d.mts`,
      `${base}/dist/esm/index.d.ts`,
      `${base}/build/modern/index.d.ts`,
    ];
  }
  return [
    `${base}/${rest}.d.ts`,
    `${base}/${rest}.d.mts`,
    `${base}/${rest}/index.d.ts`,
    `${base}/${rest}/index.d.mts`,
    `${base}/dist/${rest}.d.ts`,
    `${base}/dist/${rest}.d.mts`,
    `${base}/dist/${rest}/index.d.ts`,
    `${base}/dist/${rest}/index.d.mts`,
    `${base}/dist/types/${rest}.d.ts`,
    `${base}/dist/types/${rest}/index.d.ts`,
    `${base}/dist/esm/${rest}.d.ts`,
    `${base}/dist/esm/${rest}/index.d.ts`,
    `${base}/build/modern/${rest}.d.ts`,
    `${base}/build/modern/${rest}/index.d.ts`,
  ];
}

function firstExisting(
  candidates: string[],
  read: VfsRead
): string | undefined {
  for (const c of candidates) {
    if (read(c) != null) {
      return c;
    }
  }
}

function typesPathFromPackageJson(
  pkgJsonText: string,
  pkg: string,
  name: string,
  rest: string
): string | undefined {
  try {
    const pkgJson = JSON.parse(pkgJsonText) as {
      types?: string;
      typings?: string;
      exports?: Record<
        string,
        { types?: string | { default?: string; import?: string } } | string
      >;
    };
    const expKey = name === pkg ? "." : `./${rest}`;
    const exp = pkgJson.exports?.[expKey];
    if (typeof exp === "object" && exp?.types) {
      return typeof exp.types === "string"
        ? exp.types
        : (exp.types.import ?? exp.types.default);
    }
    if (name === pkg) {
      return pkgJson.types ?? pkgJson.typings;
    }
  } catch {
    /* ignore malformed package.json in VFS */
  }
}

function resolveKnownPackage(
  name: string,
  pkg: string,
  read: VfsRead
): string | undefined {
  if (name !== pkg && !name.startsWith(`${pkg}/`)) {
    return;
  }
  const rest = name === pkg ? "" : name.slice(pkg.length + 1);
  const hit = firstExisting(candidatesForPackage(pkg, rest), read);
  if (hit) {
    return hit;
  }
  const base = `/node_modules/${pkg}`;
  const pkgJsonText = read(`${base}/package.json`);
  if (!pkgJsonText) {
    return;
  }
  const typesPath = typesPathFromPackageJson(pkgJsonText, pkg, name, rest);
  if (!typesPath) {
    return;
  }
  const abs = joinPath(`${base}/`, typesPath.replace(LEADING_DOT_SLASH, ""));
  if (read(abs) != null) {
    return abs;
  }
}

export function resolvePackage(
  name: string,
  overlay: Map<string, string>,
  containingFile?: string
): string | undefined {
  if (!(isVfsInternal(containingFile) || KERNEL_SERVED.has(name))) {
    return;
  }
  const read: VfsRead = (p) => readVfs(p, overlay);

  const entry = PACKAGE_ENTRY[name];
  if (entry) {
    if (read(entry) != null) {
      return entry;
    }
    // ESM dual package: .d.ts entry missing but .d.mts present (clsx).
    const mts = entry.replace(D_TS_TO_D_MTS, ".d.mts");
    if (mts !== entry && read(mts) != null) {
      return mts;
    }
  }

  for (const pkg of KNOWN_PACKAGES) {
    const resolved = resolveKnownPackage(name, pkg, read);
    if (resolved) {
      return resolved;
    }
  }
}

export function resolveRelative(
  name: string,
  containingFile: string,
  overlay: Map<string, string>
): string | undefined {
  const base = normalizePath(containingFile);
  const dir = base.slice(0, base.lastIndexOf("/") + 1);
  const stripped = name.replace(JS_SUFFIX, "").replace(MJS_SUFFIX, "");
  const candidates = [
    joinPath(dir, name),
    joinPath(dir, `${name}.ts`),
    joinPath(dir, `${name}.tsx`),
    joinPath(dir, `${name}.d.ts`),
    joinPath(dir, `${name}.d.mts`),
    joinPath(dir, `${stripped}.d.ts`),
    joinPath(dir, `${stripped}.d.mts`),
    joinPath(dir, `${stripped}.ts`),
    joinPath(dir, `${name}/index.ts`),
    joinPath(dir, `${stripped}/index.d.ts`),
    joinPath(dir, `${stripped}/index.d.mts`),
  ];
  return firstExisting(candidates, (p) => readVfs(p, overlay));
}
