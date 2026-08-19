/**
 * Catalog names copied into `starters/erp` at bake time (`assemble-erp-starter`
 * → `seed.json`). The catalog may list more; those stay add-only until this
 * list grows. Create still copies the snapshot — it does not fetch recipes.
 */
export const ERP_SEED_RECIPES = [
  "lite/alert",
  "lite/alert-dialog",
  "lite/avatar",
  "lite/badge",
  "lite/breadcrumb",
  "lite/button",
  "lite/card",
  "lite/dialog",
  "lite/dropdown-menu",
  "lite/empty-state",
  "lite/field",
  "lite/input",
  "lite/label",
  "lite/select",
  "lite/separator",
  "lite/sheet",
  "lite/sidebar",
  "lite/skeleton",
  "lite/table",
  "lite/tooltip",
  "lite/use-mobile",
  "lite/utils",
] as const;
