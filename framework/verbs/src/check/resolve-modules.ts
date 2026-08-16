/**
 * Module resolution against the types VFS (+ per-app overlay).
 *
 * Side-aware for app sources: client files (see isClientAppPath) resolve
 * against CLIENT_IMPORT_MAP only, and may not value-import app modules
 * outside that tree. Server files keep the union gate. One LanguageService
 * / one VFS — classification only changes which specifiers resolve, not how
 * many programs are built.
 */
import type { ManifestV0 } from "@sfab-lite/core";
import {
  CLIENT_IMPORT_MAP,
  SERVER_IMPORT_MAP,
  TYPES_VFS,
} from "@sfab-lite/kernel";
import { joinPath, normalizePath, readVfs } from "./vfs.js";

/**
 * Every bare specifier the kernel actually serves at runtime.
 *
 * App code may only import from this set. The types VFS is built by a
 * closure prune and therefore ships `.d.ts` for far more subpaths than the
 * import maps cover — 313 of them export runtime values. Without this gate
 * those resolve here, typecheck clean, pass the publish gate, and then throw
 * `Failed to resolve module specifier` in the browser with an empty `#root`.
 * That is the failure mode; `@base-ui/react` was one instance of it.
 *
 * Client app files narrow further to CLIENT_IMPORT_MAP (see isClientAppPath).
 */
const KERNEL_SERVED: ReadonlySet<string> = new Set([
  ...Object.keys(CLIENT_IMPORT_MAP),
  ...Object.keys(SERVER_IMPORT_MAP),
]);

const CLIENT_SERVED: ReadonlySet<string> = new Set(
  Object.keys(CLIENT_IMPORT_MAP)
);

const SERVER_SERVED: ReadonlySet<string> = new Set(
  Object.keys(SERVER_IMPORT_MAP)
);

function packageRoot(specifier: string): string {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  }
  const slash = specifier.indexOf("/");
  return slash === -1 ? specifier : specifier.slice(0, slash);
}

/** Package names whose `.d.ts` ride in the types VFS (served + transitive). */
const VFS_PACKAGES: ReadonlySet<string> = (() => {
  const pkgs = new Set<string>();
  for (const key of Object.keys(TYPES_VFS)) {
    if (!key.startsWith("/node_modules/")) {
      continue;
    }
    pkgs.add(packageRoot(key.slice("/node_modules/".length)));
  }
  return pkgs;
})();

/** Package roots the runtime actually serves — derived from the import maps. */
const SERVED_PACKAGE_ROOTS: ReadonlySet<string> = new Set(
  [...KERNEL_SERVED].map(packageRoot)
);

const SERVED_SURFACE =
  `An app may import the base runtime (${[...SERVED_PACKAGE_ROOTS].sort().join(", ")}), ` +
  "registry-copied source under src/, and its own files.";

const CLOSED_RESOLVE_FIX =
  "Fix: write it in-tree, or use a registry recipe. npm packages cannot be added to a lite app.";

const LEADING_SLASHES = /^\/+/;

/**
 * RFC §2 client tree: the client entry, its stylesheet, and
 * `src/{routes,components,hooks,lib}/`. Everything else under `src/` is
 * server-side. `dirname(client.entry)` is `src/`, so a dirname prefix would
 * swallow hono/db/auth — the tree is named, not derived.
 */
const RFC_CLIENT_DIRS = ["routes", "components", "hooks", "lib"] as const;

const CLIENT_TREE_REL = "src/{routes,components,hooks,lib}";

export function clientPrefixesFromManifest(
  manifest: ManifestV0
): readonly string[] {
  return [
    normalizePath(`/app/${manifest.client.entry.replace(LEADING_SLASHES, "")}`),
    normalizePath(
      `/app/${manifest.client.styles.replace(LEADING_SLASHES, "")}`
    ),
    ...RFC_CLIENT_DIRS.map((dir) => `${normalizePath(`/app/src/${dir}`)}/`),
  ];
}

export function isClientAppPath(
  path: string | undefined,
  prefixes: readonly string[]
): boolean {
  if (path == null) {
    return false;
  }
  const n = normalizePath(path);
  return prefixes.some((prefix) =>
    prefix.endsWith("/") ? n.startsWith(prefix) : n === prefix
  );
}

function isAppSourcePath(path: string): boolean {
  return normalizePath(path).startsWith("/app/");
}

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
  return (
    containingFile != null &&
    normalizePath(containingFile).startsWith("/node_modules/")
  );
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
  "@radix-ui/react-icons",
  "clsx",
  "class-variance-authority",
  "tailwind-merge",
  "@types/react",
  "@types/react-dom",
] as const;

type VfsRead = (p: string) => string | undefined;

export interface ResolveOpts {
  /** `import type` / type-only named bindings — erased at emit; may cross sides. */
  typeOnly?: boolean;
  clientPrefixes: readonly string[];
}

function bareAllowed(
  name: string,
  containingFile: string | undefined,
  typeOnly: boolean,
  clientPrefixes: readonly string[]
): boolean {
  if (isVfsInternal(containingFile)) {
    return true;
  }
  if (isClientAppPath(containingFile, clientPrefixes)) {
    if (CLIENT_SERVED.has(name)) {
      return true;
    }
    // Type-only may resolve any kernel-served specifier (e.g. inferring a
    // server type). Value imports may not.
    return typeOnly && KERNEL_SERVED.has(name);
  }
  return KERNEL_SERVED.has(name);
}

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

function relativeCandidates(name: string, containingFile: string): string[] {
  const base = normalizePath(containingFile);
  const dir = base.slice(0, base.lastIndexOf("/") + 1);
  const stripped = name.replace(JS_SUFFIX, "").replace(MJS_SUFFIX, "");
  return [
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
}

/** Resolve a relative specifier with no side gate (used for diagnostics). */
function resolveRelativePath(
  name: string,
  containingFile: string,
  overlay: Map<string, string>
): string | undefined {
  return firstExisting(relativeCandidates(name, containingFile), (p) =>
    readVfs(p, overlay)
  );
}

export function resolvePackage(
  name: string,
  overlay: Map<string, string>,
  containingFile: string | undefined,
  opts: ResolveOpts
): string | undefined {
  const typeOnly = opts.typeOnly === true;
  const clientPrefixes = opts.clientPrefixes;
  if (!bareAllowed(name, containingFile, typeOnly, clientPrefixes)) {
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
  overlay: Map<string, string>,
  opts: ResolveOpts
): string | undefined {
  const clientPrefixes = opts.clientPrefixes;
  const resolved = resolveRelativePath(name, containingFile, overlay);
  if (!resolved) {
    return;
  }
  if (
    isClientAppPath(containingFile, clientPrefixes) &&
    opts?.typeOnly !== true &&
    isAppSourcePath(resolved) &&
    !isClientAppPath(resolved, clientPrefixes)
  ) {
    return;
  }
  return resolved;
}

/**
 * Agent-facing message when a client file fails to resolve for a side reason.
 * Returns undefined when the failure is not side-related (unknown module, etc.).
 */
export function sideAwareUnresolvedMessage(
  moduleName: string,
  containingFile: string | undefined,
  overlay: Map<string, string>,
  clientPrefixes: readonly string[]
): string | undefined {
  if (!(containingFile && isClientAppPath(containingFile, clientPrefixes))) {
    return;
  }

  if (moduleName.startsWith(".")) {
    const target = resolveRelativePath(moduleName, containingFile, overlay);
    if (
      target &&
      isAppSourcePath(target) &&
      !isClientAppPath(target, clientPrefixes)
    ) {
      return (
        `Module '${moduleName}' resolves outside the client tree (${CLIENT_TREE_REL}/) and ` +
        "cannot be imported as a value from client code. Use `import type` if " +
        "you only need types, or call the server through the typed API client " +
        `(hono/client) instead of importing server modules into ${CLIENT_TREE_REL}/.`
      );
    }
    return;
  }

  if (SERVER_SERVED.has(moduleName) && !CLIENT_SERVED.has(moduleName)) {
    return (
      `Module '${moduleName}' is server-only (served by the server import map, ` +
      "not the client import map) and cannot be imported from client code under " +
      `${CLIENT_TREE_REL}/. Move the usage to a server route and reach it via the typed API ` +
      "client (hono/client), or use a client-safe package from the client import map."
    );
  }
}

/**
 * Agent-facing message when app source imports a bare specifier the runtime
 * does not serve. Vendor `.d.ts` in the VFS still resolve unrestricted
 * (`isVfsInternal`); this is only the app-source gate.
 *
 * Returns undefined when the failure is not a closed-resolve miss (relative
 * import, already-served specifier whose types path is missing, side-aware
 * client/server miss — those have their own messages).
 */
export function closedResolveUnresolvedMessage(
  moduleName: string,
  containingFile: string | undefined,
  clientPrefixes: readonly string[]
): string | undefined {
  if (
    containingFile == null ||
    isVfsInternal(containingFile) ||
    moduleName.startsWith(".") ||
    KERNEL_SERVED.has(moduleName)
  ) {
    return;
  }
  if (
    isClientAppPath(containingFile, clientPrefixes) &&
    SERVER_SERVED.has(moduleName) &&
    !CLIENT_SERVED.has(moduleName)
  ) {
    return;
  }

  const pkg = packageRoot(moduleName);
  let why: string;
  if (SERVED_PACKAGE_ROOTS.has(pkg)) {
    why = `the kernel serves "${pkg}", but not the specifier "${moduleName}"`;
  } else if (VFS_PACKAGES.has(pkg)) {
    why =
      "it is transitive-only: present so vendor types can resolve, not served to apps";
  } else {
    why = "not part of the app surface";
  }

  return [
    `LITE-RESOLVE: Cannot import "${moduleName}" — ${why}.`,
    SERVED_SURFACE,
    CLOSED_RESOLVE_FIX,
  ].join("\n");
}
