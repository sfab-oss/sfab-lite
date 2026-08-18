import type { ManifestV0 } from "@sfab-lite/core";
import seed from "@sfab-lite/starter-erp/seed" with { type: "json" };

export const SEED_MANIFEST = JSON.parse(
  seed.sourceFiles["manifest.json"]
) as ManifestV0;
