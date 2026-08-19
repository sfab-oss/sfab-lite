/**
 * Fetch declared catalog-module ESM from KERNEL_R2 for the app Loader child.
 *
 * Git is the source of truth; R2 is the version-retention annex. Missing
 * manifest → named 409. The host Worker must not import these bytes.
 */
import type { ManifestModule } from "@sfab-lite/core";
import {
  catalogEntry,
  catalogLoaderKey,
  catalogModuleR2Prefix,
} from "@sfab-lite/core/catalog-modules";

export interface CatalogModuleR2 {
  head: (key: string) => Promise<unknown>;
  get: (key: string) => Promise<{ text: () => Promise<string> } | null>;
}

export type CatalogLoaderResult =
  | { ok: true; modules: Record<string, { js: string }> }
  | { ok: false; response: Response };

function missing(requested: string): Response {
  return Response.json(
    {
      ok: false,
      error: "catalog_module_missing",
      requested,
    },
    { status: 409 }
  );
}

export async function catalogLoaderModules(
  bucket: CatalogModuleR2,
  modules: readonly ManifestModule[] | null | undefined,
  runtime?: string
): Promise<CatalogLoaderResult> {
  if (modules == null || modules.length === 0) {
    return { ok: true, modules: {} };
  }

  const loaded: Record<string, { js: string }> = {};
  for (const declared of modules) {
    const requested = `${declared.name}@${declared.version}`;
    const entry = catalogEntry(declared.name, declared.version);
    if (entry?.plane !== "server") {
      return {
        ok: false,
        response: Response.json(
          {
            ok: false,
            error: "catalog_module_unknown",
            requested,
          },
          { status: 409 }
        ),
      };
    }
    if (runtime != null && entry.runtime !== runtime) {
      return {
        ok: false,
        response: Response.json(
          {
            ok: false,
            error: "catalog_module_runtime_mismatch",
            requested,
            moduleRuntime: entry.runtime,
            appRuntime: runtime,
          },
          { status: 409 }
        ),
      };
    }
    const prefix = catalogModuleR2Prefix(declared.name, declared.version);
    const manifestKey = `${prefix}/manifest.json`;
    if (!(await bucket.head(manifestKey))) {
      return { ok: false, response: missing(requested) };
    }
    const loaderKey = catalogLoaderKey(declared.name);
    if (!loaderKey) {
      return { ok: false, response: missing(requested) };
    }
    const object = await bucket.get(`${prefix}/${entry.esmFile}`);
    if (!object) {
      return {
        ok: false,
        response: Response.json(
          {
            ok: false,
            error: "catalog_module_object_missing",
            requested,
            file: entry.esmFile,
          },
          { status: 500 }
        ),
      };
    }
    loaded[loaderKey] = { js: await object.text() };
  }
  return { ok: true, modules: loaded };
}
