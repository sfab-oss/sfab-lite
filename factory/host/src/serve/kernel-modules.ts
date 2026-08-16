/**
 * The frozen kernel as the Worker Loader wants it.
 *
 * Paths come from `@sfab-lite/kernel` (`KERNEL_PATHS`); this module
 * attaches the vendored bodies. Compiler, loader, and schema-probe must
 * agree on the keys.
 */
import {
  KERNEL_BETTER_AUTH,
  KERNEL_DRIZZLE,
  KERNEL_HONO,
  KERNEL_JSX_RUNTIME,
  KERNEL_PATHS,
  KERNEL_REACT,
  KERNEL_REACT_DOM,
  KERNEL_REACT_DOM_SERVER,
  KERNEL_ZOD,
} from "@sfab-lite/kernel";

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
