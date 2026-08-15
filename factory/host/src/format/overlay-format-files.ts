import {
  generateFormatFiles,
  type ManifestV0,
  validateManifest,
} from "@sfab-lite/core";
import { FORMAT_PINS } from "@sfab-lite/kernel/pins";

export interface OverlaidTree {
  files: Record<string, string>;
  manifest: ManifestV0;
}

function readTreeManifest(
  files: Record<string, string>,
  label: string
): ManifestV0 {
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
  const validated = validateManifest(parsed);
  if (!validated.ok) {
    throw new Error(
      `${label}: invalid manifest.json: ${validated.issues
        .map((i) => `${i.path}: ${i.message}`)
        .join("; ")}`
    );
  }
  return validated.manifest;
}

/**
 * Overlay the four generated format files onto a source tree. Create, CD
 * materialise and workspace compile call this; add regenerates inside
 * apply-add. Agent edits are overwritten.
 */
export function overlayFormatFiles(
  files: Record<string, string>
): OverlaidTree {
  const manifest = readTreeManifest(files, "overlayFormatFiles");
  return {
    files: { ...files, ...generateFormatFiles(manifest, FORMAT_PINS) },
    manifest,
  };
}
