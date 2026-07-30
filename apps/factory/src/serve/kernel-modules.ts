/**
 * The frozen kernel as the Worker Loader wants it.
 *
 * Three places need this map and they must agree: the compiler marks these
 * paths external, the loader supplies their bodies, and the schema probe does
 * both. When the compiler and the loader disagree about a key, the failure is
 * an unresolved import at runtime rather than a build error, so the map lives
 * here once instead of once per caller.
 */
import {
  KERNEL_BETTER_AUTH,
  KERNEL_DRIZZLE,
  KERNEL_HONO,
  KERNEL_JSX_RUNTIME,
  KERNEL_REACT,
  KERNEL_REACT_DOM,
  KERNEL_REACT_DOM_SERVER,
  KERNEL_ZOD,
} from "@sfab-lite/kernel";

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

export function kernelModules(): Record<string, { js: string }> {
  return {
    [KERNEL_PATHS.react]: { js: KERNEL_REACT },
    [KERNEL_PATHS.jsxRuntime]: { js: KERNEL_JSX_RUNTIME },
    [KERNEL_PATHS.reactDom]: { js: KERNEL_REACT_DOM },
    [KERNEL_PATHS.reactDomServer]: { js: KERNEL_REACT_DOM_SERVER },
    [KERNEL_PATHS.drizzle]: { js: KERNEL_DRIZZLE },
    [KERNEL_PATHS.betterAuth]: { js: KERNEL_BETTER_AUTH },
    [KERNEL_PATHS.hono]: { js: KERNEL_HONO },
    [KERNEL_PATHS.zod]: { js: KERNEL_ZOD },
  };
}
