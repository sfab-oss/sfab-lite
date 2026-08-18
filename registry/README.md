# registry/

Recipes repo: versioned content on its own cadence, a consumer of
`framework/`, not a part of it. Hosted `add` lives in `factory/` (it
may import this package). This package must not know the factory
exists.

## Pinned schema

We reuse the shadcn **item format** and the standard served registry
(`/r/{name}.json`, `@lite` namespace). Lite's overlay stays fail-closed.

| | |
| --- | --- |
| Upstream URL | `https://ui.shadcn.com/schema/registry-item.json` (unversioned) |
| Vendored copy | `schema/registry-item.json` |
| Fetched | 2026-08-14 |
| sha256 | `sha256:cdf0fba75a26ebf594018264eff2d55407ec14deb3071d0fce0e2b20848e5d44` |
| Pin statement | `src/pin.ts` |

Lite's profile: allowed types only, no npm `dependencies` /
`devDependencies` keys, `lite/` catalog names, required
`meta.liteProfile: 1`. Upstream schema changes are adopted by replacing
the vendored file on our schedule.

## Resolver and namespace

Catalog and provenance keys stay `lite/<slug>`. The CLI address is
`@lite/<slug>`. Bare names hard-error before any catalog lookup — they
must never reach ui.shadcn.com. Foreign namespaces (`@shadcn/…`) are
refused. `add` resolves `registryDependencies` flat.

`npx shadcn add @lite/button` works for local/ejected apps because
`components.json` configures `@lite` as the **only** registry, pointing
at the served URL. That replaces any wrapper CLI. The CLI's built-in
official registry still resolves a *bare* `button`; hosted `add` does
not.

## Served registry

Canonical address: `https://lite.sfab.dev/r/{name}.json` (`{name}` is
the slug, e.g. `button`). Public GET/HEAD, no auth — registry items are
AGPL source. Served from the bundled catalog (no R2, no DO). Latest
per name; shadcn addresses have no version. Provenance still records
the exact version. Old versions stay in git. GitHub source-registry
form (`owner/repo/item#ref`) is a possible later bonus, not the
canonical address.

`registry.json` is the generated shadcn **source** registry (latest
per slug, namespaced deps). One source of truth stays `recipes/`.

## Immutable version retention

Published versions live at `recipes/<slug>/<version>/`. `published.json`
is the hash lockfile of every file in each published tree. `check:registry`
recomputes those hashes and, when `origin/main:registry/published.json`
exists, refuses any change or deletion of an existing `name@version`
key. Ship a new version by adding a new directory; never mutate `0.1.0`
in place. No auto-update, ever.
The harness decides when an app moves to a newer recipe version
([ADR-0013](../docs/decisions/0013-templates-and-registry-are-inert.md)).

## What a recipe may target (ratified, owner 2026-08-14)

Applied migrations are an immutable ledger (ADR-0005: `db:generate` is
offline; CD applies by id and hash). A credit-ledger recipe wants a
table, not a row in that ledger.

**Recipes may copy schema source under `src/db/` (and ordinary
`src/` files). They must not target `migrations/` or `migrations/meta/`.**
The validator refuses those targets. Schema lands via `add`;
`db:generate` produces the SQL. Overwrite `add` does not extend to
those targets.

## Hosted `add`

`factory/host` `POST /api/protected/apps/:appId/add` and MCP `apps_add`
copy source and write `manifest.recipes` (`{ version, files: { path:
sha256 } }`). Re-adding **overwrites** target files (shadcn-standard).
Identical content is skipped. Every add ships through the PR loop; the
PR diff is the review surface. Response `200` includes `overwrote: […]`.
No modified-since-add warnings.

## CLI agreement

`pnpm check:registry-agreement` (CI-only) runs the real `shadcn@4.17.0`
CLI: `registry validate` on the generated source registry, then `add
@lite/<slug>` against a locally served `/r/{name}.json` for every
published recipe, asserting byte-identical placement vs `planAdd`.

## Recipes in this milestone

Extracted from the starter's shared UI so the starter can assemble
from the registry. Targets are the RFC §2 tree (`src/components/ui/`,
`src/lib/`). `ERP_SEED_RECIPES` is the subset copied into `starters/erp`
at bake time; today it is the whole catalog. New recipes can join the
catalog without changing that list.

| Name | Why it survives the starter rebuild |
| --- | --- |
| `lite/utils` | `cn()` — every primitive depends on it |
| `lite/button` | primary actions on party / ledger forms |
| `lite/label` | labeled controls; Field composes it |
| `lite/input` | create/edit fields |
| `lite/field` | form layout the plan's party-form assumes |
| `lite/card` | detail / balance tiles |
| `lite/table` | party list, open balances, ledger lines |
| `lite/select` | party kind; replaces the native `<select>` |
| `lite/alert` | form and mutation errors |
| `lite/empty-state` | empty parties, balances, and ledger |
