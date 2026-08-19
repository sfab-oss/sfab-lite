import type { CheckRequest } from "@sfab-lite/core";
import { moduleTypesForManifest } from "@sfab-lite/core/catalog-modules";
import type { OverlaidTree } from "@sfab-lite/verbs/format";

/**
 * Check-worker JSON body. Apps with `modules: []` omit `moduleTypes` so the
 * payload stays identical to the pre-catalog-module request.
 */
export function checkRequestBody(
  appId: string,
  tree: OverlaidTree,
  forceCold = false
): CheckRequest {
  const moduleTypes = moduleTypesForManifest(tree.manifest.modules);
  return {
    appId,
    files: tree.files,
    manifest: tree.manifest,
    forceCold,
    ...(moduleTypes ? { moduleTypes } : {}),
  };
}
