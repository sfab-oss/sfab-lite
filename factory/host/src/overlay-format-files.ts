import { LITE_REGISTRY_URL_PATTERN } from "@sfab-lite/registry/pin";
import { overlayFormatFiles as overlayFormatVerb } from "@sfab-lite/verbs/format";

export function overlayFormatFiles(
  files: Record<string, string>
): ReturnType<typeof overlayFormatVerb> {
  return overlayFormatVerb(files, { registryUrl: LITE_REGISTRY_URL_PATTERN });
}
