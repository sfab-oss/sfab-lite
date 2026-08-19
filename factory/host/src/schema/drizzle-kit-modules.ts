/**
 * Patched drizzle-kit `api.mjs` + drizzle-orm import closure for the schema
 * probe. Committed as `generated/drizzle-kit-modules.json` (path → source
 * string) and imported at build time so Vite never flattens or executes
 * `api.mjs`. Drift-gated by `check:drizzle-kit-modules`.
 */
import modulesJson from "../../generated/drizzle-kit-modules.json" with {
  type: "json",
};

export const DRIZZLE_KIT_VERSION = "0.31.10";
export const DRIZZLE_ORM_VERSION = "0.45.2";

export function drizzleKitToolVersion(): string {
  return `${DRIZZLE_KIT_VERSION}-${DRIZZLE_ORM_VERSION}`;
}

function isModuleMap(value: unknown): value is Record<string, string> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const rec = value as Record<string, unknown>;
  if (typeof rec["api.mjs"] !== "string") {
    return false;
  }
  for (const source of Object.values(rec)) {
    if (typeof source !== "string") {
      return false;
    }
  }
  return true;
}

function toLoaderModules(
  map: Record<string, string>
): Record<string, { js: string }> {
  const modules: Record<string, { js: string }> = {};
  for (const [path, source] of Object.entries(map)) {
    modules[path] = { js: source };
  }
  return modules;
}

if (!isModuleMap(modulesJson)) {
  throw new Error(
    `drizzle-kit modules map is invalid for ${drizzleKitToolVersion()}`
  );
}

const LOADER_MODULES = toLoaderModules(modulesJson);

export function drizzleKitLoaderModules(): Record<string, { js: string }> {
  return LOADER_MODULES;
}
