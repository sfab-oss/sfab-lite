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

/** The only configured namespace. Bare names still hard-error. */
export const LITE_REGISTRY_NAMESPACE = "@lite";

/**
 * Canonical served URL (production factory origin). The worker also
 * answers `/r/{name}.json` on whatever origin it is reached at.
 */
export const LITE_REGISTRY_HOMEPAGE = "https://lite.sfab.dev";
export const LITE_REGISTRY_URL_PATTERN = "https://lite.sfab.dev/r/{name}.json";
