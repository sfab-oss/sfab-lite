/**
 * @sfab-lite/kernel — frozen dependency universe for factory-built apps.
 *
 * Consumers import from this package only (not generated file paths):
 * - apps/factory → server kernel, client kernel, CSS VFS, manifest
 * - apps/check → types VFS (+ manifest)
 *
 * Generated blobs are `.js` with companion `.d.ts` stubs so typecheck does
 * not parse megabyte string literals.
 */

export { default as KERNEL_MANIFEST } from "../kernel.json" with {
  type: "json",
};

export {
  CLIENT_BAILOUTS,
  CLIENT_IMPORT_MAP,
  CLIENT_KERNEL_FILES,
} from "./generated/client-kernel.js";

export { TW_CSS_VFS, TW_INDEX_CSS_BYTES } from "./generated/css-vfs.js";
export {
  KERNEL_BETTER_AUTH,
  KERNEL_DRIZZLE,
  KERNEL_HONO,
  KERNEL_JSX_RUNTIME,
  KERNEL_REACT,
  KERNEL_REACT_DOM,
  KERNEL_REACT_DOM_SERVER,
  KERNEL_VERSION,
  KERNEL_ZOD,
} from "./generated/server-kernel.js";
export { TYPES_VFS, TYPES_VFS_MANIFEST } from "./generated/types-vfs.js";
