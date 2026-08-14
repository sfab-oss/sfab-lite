/**
 * Vendored shadcn registry-item schema pin.
 *
 * Upstream publishes an unversioned URL and has shipped three unilateral
 * schema releases in ten months. We copy the JSON and adopt changes on
 * our schedule — this file is the pin statement.
 */
export const SHADCN_REGISTRY_ITEM_SCHEMA = {
  url: "https://ui.shadcn.com/schema/registry-item.json",
  fetched: "2026-08-14",
  sha256:
    "sha256:cdf0fba75a26ebf594018264eff2d55407ec14deb3071d0fce0e2b20848e5d44",
  vendoredPath: "schema/registry-item.json",
} as const;
