import type { ManifestModule, ManifestV0 } from "@sfab-lite/core";
import { parseCatalogPin } from "@sfab-lite/core/catalog-modules";
import { generateFormatFiles } from "@sfab-lite/core/generate-format-files";
import { validateManifest } from "@sfab-lite/core/validate-manifest";
import { FORMAT_PINS } from "@sfab-lite/kernel/pins";
import catalogJson from "@sfab-lite/registry/catalog" with { type: "json" };
import { type Catalog, planAdd, resolveAdd } from "@sfab-lite/registry/lite";
import { LITE_REGISTRY_URL_PATTERN } from "@sfab-lite/registry/pin";

const CATALOG = catalogJson as Catalog;
const LEADING_SLASHES = /^\/+/;

function rel(path: string): string {
  return path.replace(LEADING_SLASHES, "");
}

function currentModules(parsed: Record<string, unknown>): ManifestModule[] {
  if (!Array.isArray(parsed.modules)) {
    return [];
  }
  const out: ManifestModule[] = [];
  for (const item of parsed.modules) {
    if (
      item &&
      typeof item === "object" &&
      "name" in item &&
      "version" in item &&
      typeof item.name === "string" &&
      typeof item.version === "string"
    ) {
      out.push({ name: item.name, version: item.version });
    }
  }
  return out;
}

function mergeModulesFromAdd(
  current: ManifestModule[],
  name: string
): ManifestModule[] {
  const resolved = resolveAdd(name, CATALOG);
  if (!resolved.ok) {
    return current;
  }
  const byName = new Map(current.map((mod) => [mod.name, mod]));
  for (const entry of resolved.entries) {
    for (const dep of entry.item.dependencies ?? []) {
      const parsed = parseCatalogPin(dep);
      if (!parsed) {
        continue;
      }
      byName.set(parsed.name, {
        name: parsed.name,
        version: parsed.version,
      });
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function readManifest(
  files: Record<string, string | null | undefined>
): { ok: true; value: unknown } | { ok: false; error: string } {
  const raw = files["manifest.json"];
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: false, error: "missing manifest.json" };
  }
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, error: "manifest.json is not JSON" };
  }
}

export type ApplyAddResult =
  | {
      ok: true;
      files: Record<string, string>;
      added: string[];
      skipped: string[];
      overwrote: string[];
      recipes: string[];
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Pure hosted `add`: copy recipe source into a files map and write
 * provenance onto `manifest.recipes`. Re-add overwrites. No I/O.
 */
export function applyAdd(
  name: string,
  files: Record<string, string | null | undefined>
): ApplyAddResult {
  const existing: Record<string, string | null | undefined> = {};
  for (const [path, content] of Object.entries(files)) {
    existing[rel(path)] = content;
  }
  const planned = planAdd(name, CATALOG, existing);
  if (!planned.ok) {
    return {
      ok: false,
      error: planned.error,
    };
  }

  const manifestInput = readManifest(existing);
  if (!manifestInput.ok) {
    return { ok: false, error: manifestInput.error };
  }
  const parsed =
    manifestInput.value && typeof manifestInput.value === "object"
      ? { ...(manifestInput.value as Record<string, unknown>) }
      : null;
  if (!parsed) {
    return { ok: false, error: "manifest.json is not an object" };
  }
  const currentRecipes =
    parsed.recipes && typeof parsed.recipes === "object"
      ? { ...(parsed.recipes as ManifestV0["recipes"]) }
      : {};
  parsed.recipes = { ...currentRecipes, ...planned.provenance };
  parsed.modules = mergeModulesFromAdd(currentModules(parsed), name);

  const validated = validateManifest(parsed);
  if (!validated.ok) {
    return {
      ok: false,
      error: `manifest.recipes failed v0 schema: ${validated.issues
        .map((i) => `${i.path}: ${i.message}`)
        .join("; ")}`,
    };
  }

  const next: Record<string, string> = {};
  for (const [path, content] of Object.entries(planned.writes)) {
    next[path] = content;
  }
  next["manifest.json"] = `${JSON.stringify(validated.manifest, null, 2)}\n`;
  Object.assign(
    next,
    generateFormatFiles(validated.manifest, FORMAT_PINS, {
      registryUrl: LITE_REGISTRY_URL_PATTERN,
    })
  );
  const overwrote = new Set(planned.overwrote);
  return {
    ok: true,
    files: next,
    added: Object.keys(planned.writes)
      .filter((path) => !overwrote.has(path))
      .sort(),
    skipped: [...planned.skipped].sort(),
    overwrote: [...planned.overwrote].sort(),
    recipes: Object.keys(planned.provenance).sort(),
  };
}
