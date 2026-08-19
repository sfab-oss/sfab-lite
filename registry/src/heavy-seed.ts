/**
 * Catalog names copied into `starters/heavy` at bake time
 * (`assemble-heavy-starter` → `seed.json`). Live catalog —
 * the gallery route imports every assembled UI module as a client root.
 *
 * Equals `catalogNames(CATALOG)` minus recipes that enable catalog
 * modules (opt-in via `apps_add` only — not the gallery snapshot).
 * Inlined so Node `--experimental-strip-types`
 * (assemble / check:manifest) does not need a compiled `catalog.js`.
 */
import catalogJson from "./generated/catalog.json" with { type: "json" };
import type { Catalog } from "./types.js";

const catalog = catalogJson as Catalog;

export const HEAVY_SEED_RECIPES = Object.keys(catalog.items)
  .filter((name) => (catalog.items[name]?.item.dependencies?.length ?? 0) === 0)
  .sort();
