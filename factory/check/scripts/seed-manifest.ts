import type { ManifestV0 } from "@sfab-lite/core";
import seed from "@sfab-lite/template/seed" with { type: "json" };

export const SEED_MANIFEST = JSON.parse(
  seed.sourceFiles["manifest.json"]
) as ManifestV0;
