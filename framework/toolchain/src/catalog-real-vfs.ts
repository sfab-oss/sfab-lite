import { CATALOG_MODULES } from "@sfab-lite/core/catalog-modules";
import catalogRealVfs from "./generated/catalog-real-vfs.json" with {
  type: "json",
};

const APP_TS = /\.(ts|tsx)$/;

const REAL_VFS = catalogRealVfs as Record<string, Record<string, string>>;

export function realModuleTypesForOverlay(overlay: Map<string, string>): {
  types: Record<string, string>;
  roots: string[];
} {
  const types: Record<string, string> = {};
  const roots: string[] = [];
  for (const entry of CATALOG_MODULES) {
    const prefix = `/app/${entry.boundary}/`;
    const hit = [...overlay.keys()]
      .filter((path) => path.startsWith(prefix) && APP_TS.test(path))
      .sort((a, b) => a.localeCompare(b));
    if (hit.length === 0) {
      continue;
    }
    const slice = REAL_VFS[entry.name];
    if (slice == null) {
      throw new Error(`missing real vfs for catalog pin ${entry.name}`);
    }
    Object.assign(types, slice);
    roots.push(...hit);
  }
  return { types, roots };
}
