/**
 * Patched drizzle-kit `api.mjs` + drizzle-orm import closure for the schema
 * probe. The map is not in the Worker script — it lives on KERNEL_R2 at
 * `tools/drizzle-kit/<kit>-<orm>/` (see upload-drizzle-kit-r2.mjs).
 */
export const DRIZZLE_KIT_VERSION = "0.31.10";
export const DRIZZLE_ORM_VERSION = "0.45.2";

export function drizzleKitToolVersion(): string {
  return `${DRIZZLE_KIT_VERSION}-${DRIZZLE_ORM_VERSION}`;
}

export function drizzleKitModulesKey(): string {
  return `tools/drizzle-kit/${drizzleKitToolVersion()}/modules.json`;
}

export function drizzleKitManifestKey(): string {
  return `tools/drizzle-kit/${drizzleKitToolVersion()}/manifest.json`;
}

export function missingDrizzleKitModulesMessage(
  version = drizzleKitToolVersion()
): string {
  return `drizzle-kit modules not uploaded for ${version} — run upload`;
}

export type DrizzleKitLoaderModules =
  | { ok: true; modules: Record<string, { js: string }> }
  | { ok: false; error: string };

let cached: {
  version: string;
  modules: Record<string, { js: string }>;
} | null = null;

export function resetDrizzleKitModulesCache(): void {
  cached = null;
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

export async function drizzleKitLoaderModules(
  env: Env
): Promise<DrizzleKitLoaderModules> {
  const version = drizzleKitToolVersion();
  if (cached?.version === version) {
    return { ok: true, modules: cached.modules };
  }

  const missing = missingDrizzleKitModulesMessage(version);
  const manifest = await env.KERNEL_R2.head(drizzleKitManifestKey());
  if (!manifest) {
    return { ok: false, error: missing };
  }
  const object = await env.KERNEL_R2.get(drizzleKitModulesKey());
  if (!object) {
    return { ok: false, error: missing };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await object.text());
  } catch {
    return { ok: false, error: missing };
  }
  if (!isModuleMap(parsed)) {
    return { ok: false, error: missing };
  }

  const modules = toLoaderModules(parsed);
  cached = { version, modules };
  return { ok: true, modules };
}
