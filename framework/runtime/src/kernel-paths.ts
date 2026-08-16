/**
 * Flat LOADER keys for kernel chunks. Compiler externals, loader module
 * map, and schema-probe must agree on these strings.
 */
export const KERNEL_PATHS = {
  react: "react.js",
  jsxRuntime: "jsx-runtime.js",
  reactDom: "react-dom.js",
  reactDomServer: "react-dom-server.js",
  drizzle: "drizzle-orm.js",
  betterAuth: "better-auth.js",
  hono: "hono.js",
  zod: "zod.js",
} as const;
