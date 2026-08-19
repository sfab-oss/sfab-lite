/**
 * Catalog names copied into `starters/base` at bake time (`assemble-base-starter`
 * → `seed.json`). The catalog may list more; those stay add-only until this
 * list grows. Create still copies the snapshot — it does not fetch recipes.
 */
export const BASE_SEED_RECIPES = [
  "lite/alert",
  "lite/avatar",
  "lite/breadcrumb",
  "lite/button",
  "lite/card",
  "lite/dropdown-menu",
  "lite/empty-state",
  "lite/field",
  "lite/input",
  "lite/label",
  "lite/separator",
  "lite/sheet",
  "lite/sidebar",
  "lite/skeleton",
  "lite/theme-toggle",
  "lite/tooltip",
  "lite/use-mobile",
  "lite/utils",
] as const;
