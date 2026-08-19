import catalogJson from "@sfab-lite/registry/catalog" with { type: "json" };
import {
  type Catalog,
  recipeCatalogDependencies,
} from "@sfab-lite/registry/lite";
import { LITE_REGISTRY_URL_PATTERN } from "@sfab-lite/registry/pin";
import { overlayFormatFiles as overlayFormatVerb } from "@sfab-lite/verbs/format";

const RECIPE_DEPENDENCIES = recipeCatalogDependencies(catalogJson as Catalog);

export function overlayFormatFiles(
  files: Record<string, string>
): ReturnType<typeof overlayFormatVerb> {
  return overlayFormatVerb(files, {
    registryUrl: LITE_REGISTRY_URL_PATTERN,
    recipeDependencies: RECIPE_DEPENDENCIES,
  });
}
