/**
 * Bare server specifiers the LOADER / compile-server rewrite onto flat chunks.
 * Keep in sync with factory/host/src/compile/compile-server.ts
 * KERNEL_VIRTUAL_MODULES.
 */
export const SERVER_IMPORT_MAP = {
  react: "./react.js",
  "react/jsx-runtime": "./jsx-runtime.js",
  "react-dom": "./react-dom.js",
  "react-dom/server": "./react-dom-server.js",
  "drizzle-orm": "./drizzle-orm.js",
  "drizzle-orm/sql": "./drizzle-orm.js",
  "drizzle-orm/sqlite-core": "./drizzle-orm.js",
  "drizzle-orm/d1": "./drizzle-orm.js",
  "better-auth": "./better-auth.js",
  "better-auth/adapters/drizzle": "./better-auth.js",
  "better-auth/plugins": "./better-auth.js",
  hono: "./hono.js",
  "hono/factory": "./hono.js",
  "hono/validator": "./hono.js",
  zod: "./zod.js",
};

export const DRIZZLE_SERVED_SPECIFIERS = [
  "drizzle-orm",
  "drizzle-orm/sql",
  "drizzle-orm/sqlite-core",
  "drizzle-orm/d1",
];

const DRIZZLE_VFS_PREFIX = "/node_modules/drizzle-orm";

/** @param {string} vfsPath */
export function isDrizzleDeclVfsPath(vfsPath) {
  if (
    !(
      vfsPath === DRIZZLE_VFS_PREFIX ||
      vfsPath.startsWith(`${DRIZZLE_VFS_PREFIX}/`)
    )
  ) {
    return false;
  }
  if (vfsPath.endsWith("package.json") || vfsPath.endsWith(".json")) {
    return false;
  }
  return /\.d\.[cm]?ts$/i.test(vfsPath) || /\.(mts|cts|ts)$/i.test(vfsPath);
}
