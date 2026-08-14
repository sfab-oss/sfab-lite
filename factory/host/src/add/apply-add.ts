import type { ManifestV0 } from "@sfab-lite/core";
import { validateManifest } from "@sfab-lite/core/validate-manifest";
import catalogJson from "@sfab-lite/registry/catalog" with { type: "json" };
import { type Catalog, planAdd } from "@sfab-lite/registry/lite";
import TEMPLATE_SEED from "@sfab-lite/template/seed" with { type: "json" };

const CATALOG = catalogJson as Catalog;
const LEADING_SLASHES = /^\/+/;

function rel(path: string): string {
  return path.replace(LEADING_SLASHES, "");
}

function readManifest(
  files: Record<string, string | null | undefined>,
  fallback: unknown
): unknown {
  const raw = files["manifest.json"] ?? files["/manifest.json"];
  if (typeof raw === "string" && raw.length > 0) {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  return fallback;
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
  files: Record<string, string | null | undefined>,
  fallbackManifest: unknown = TEMPLATE_SEED.manifest
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

  const manifestInput = readManifest(existing, fallbackManifest);
  const parsed =
    manifestInput && typeof manifestInput === "object"
      ? { ...(manifestInput as Record<string, unknown>) }
      : { ...(fallbackManifest as Record<string, unknown>) };
  const currentRecipes =
    parsed.recipes && typeof parsed.recipes === "object"
      ? { ...(parsed.recipes as ManifestV0["recipes"]) }
      : {};
  parsed.recipes = { ...currentRecipes, ...planned.provenance };

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
