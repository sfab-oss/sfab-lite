/**
 * Catalog names copied into `starters/erp` at bake time (`assemble-erp-starter`
 * → `seed.json`). The catalog may list more; those stay add-only until this
 * list grows. Create still copies the snapshot — it does not fetch recipes.
 */
export const ERP_SEED_RECIPES = [
  "lite/alert",
  "lite/button",
  "lite/card",
  "lite/empty-state",
  "lite/field",
  "lite/input",
  "lite/label",
  "lite/select",
  "lite/table",
  "lite/utils",
] as const;
