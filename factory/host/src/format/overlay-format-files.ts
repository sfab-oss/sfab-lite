import { generateFormatFiles, validateManifest } from "@sfab-lite/core";
import { PINS, UNIVERSE_EXTRA_PINS } from "@sfab-lite/kernel/pins";

function servedFormatPins(): Record<string, string> {
  return { ...PINS, ...UNIVERSE_EXTRA_PINS };
}

/**
 * Overlay the four generated format files onto a source tree. Create and
 * CD materialise call this; add regenerates via apply-add (node tests
 * cannot load this module). Agent edits are overwritten.
 */
export function overlayFormatFiles(
  files: Record<string, string>
): Record<string, string> {
  const raw = files["manifest.json"];
  if (raw == null || raw === "") {
    throw new Error("overlayFormatFiles: missing manifest.json");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error("overlayFormatFiles: manifest.json is not JSON", {
      cause: err,
    });
  }
  const validated = validateManifest(parsed);
  if (!validated.ok) {
    throw new Error(
      `overlayFormatFiles: invalid manifest: ${validated.issues
        .map((i) => `${i.path}: ${i.message}`)
        .join("; ")}`
    );
  }
  return {
    ...files,
    ...generateFormatFiles(validated.manifest, servedFormatPins()),
  };
}
