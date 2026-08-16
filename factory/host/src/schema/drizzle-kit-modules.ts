import { DRIZZLE_KIT_MODULES } from "../generated/drizzle-kit-modules.js";

export function drizzleKitLoaderModules(): Record<string, { js: string }> {
  const modules: Record<string, { js: string }> = {};
  for (const [path, source] of Object.entries(DRIZZLE_KIT_MODULES)) {
    modules[path] = { js: source };
  }
  return modules;
}
