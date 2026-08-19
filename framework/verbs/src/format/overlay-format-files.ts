import type { ManifestV0 } from "@sfab-lite/core";
import { modulesFromRecipeNames } from "@sfab-lite/core/catalog-modules";
import { generateFormatFiles } from "@sfab-lite/core/generate-format-files";
import { validateManifest } from "@sfab-lite/core/validate-manifest";
import { FORMAT_PINS } from "@sfab-lite/kernel/pins";

export interface OverlaidTree {
  files: Record<string, string>;
  manifest: ManifestV0;
}

export interface OverlayFormatOptions {
  registryUrl: string;
  recipeDependencies: Readonly<Record<string, readonly string[]>>;
}

function recipeNames(parsed: Record<string, unknown>): string[] {
  if (
    parsed.recipes == null ||
    typeof parsed.recipes !== "object" ||
    Array.isArray(parsed.recipes)
  ) {
    return [];
  }
  return Object.keys(parsed.recipes);
}

function modulesEqual(left: unknown, right: ManifestV0["modules"]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readTreeManifest(
  files: Record<string, string>,
  label: string,
  recipeDependencies: OverlayFormatOptions["recipeDependencies"]
): { manifest: ManifestV0; modulesRewritten: boolean } {
  const raw = files["manifest.json"];
  if (raw == null || raw === "") {
    throw new Error(`${label}: missing manifest.json`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${label}: manifest.json is not JSON`, { cause: err });
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label}: manifest.json is not an object`);
  }
  const body = parsed as Record<string, unknown>;
  const modules = modulesFromRecipeNames(recipeNames(body), recipeDependencies);
  const validated = validateManifest({ ...body, modules });
  if (!validated.ok) {
    throw new Error(
      `${label}: invalid manifest.json: ${validated.issues
        .map((i) => `${i.path}: ${i.message}`)
        .join("; ")}`
    );
  }
  return {
    manifest: validated.manifest,
    modulesRewritten: !modulesEqual(body.modules, modules),
  };
}

/**
 * Overlay generated format files onto a source tree. Create, CD
 * materialise and workspace compile call this; add regenerates inside
 * apply-add. Agent edits are overwritten. `manifest.modules` is
 * recomputed from `manifest.recipes` × catalog pins so owner edits
 * do not stick.
 */
export function overlayFormatFiles(
  files: Record<string, string>,
  options: OverlayFormatOptions
): OverlaidTree {
  const { manifest, modulesRewritten } = readTreeManifest(
    files,
    "overlayFormatFiles",
    options.recipeDependencies
  );
  const next: Record<string, string> = {
    ...files,
    ...generateFormatFiles(manifest, FORMAT_PINS, {
      registryUrl: options.registryUrl,
    }),
  };
  if (modulesRewritten) {
    next["manifest.json"] = `${JSON.stringify(manifest, null, 2)}\n`;
  }
  return { files: next, manifest };
}
