# registry/

Recipes repo: versioned content on its own cadence, a consumer of
`framework/`, not a part of it. Hosted `add` lives in `factory/` (it
may import this package). This package must not know the factory
exists.

## Pinned schema

We reuse the shadcn **item format**, not shadcn's resolver or CLI.

| | |
| --- | --- |
| Upstream URL | `https://ui.shadcn.com/schema/registry-item.json` (unversioned) |
| Vendored copy | `schema/registry-item.json` |
| Fetched | 2026-08-14 |
| sha256 | `sha256:cdf0fba75a26ebf594018264eff2d55407ec14deb3071d0fce0e2b20848e5d44` |
| Pin statement | `src/pin.ts` |

Lite's profile is a fail-closed overlay: allowed types only, no npm
`dependencies` / `devDependencies` keys, `lite/` names, required
`meta.liteProfile: 1`. Upstream schema changes are adopted by replacing
the vendored file on our schedule.

## Resolver

`parseRecipeName` / `resolveAdd` are lite's own. Recipe names live in
the `lite/` namespace. **Bare names hard-error before any catalog
lookup** — they must never reach anything that could leak to
ui.shadcn.com. `add` resolves `registryDependencies` flat.

Stock shadcn tooling is not claimed to work.

## Immutable version retention

Published versions live at `recipes/<slug>/<version>/`. `published.json`
is the hash lockfile of every file in each published tree (content
addressing). `check:registry` recomputes those hashes and, when
`origin/main:registry/published.json` exists, refuses any change or
deletion of an existing `name@version` key. Ship a new version by adding
a new directory; never mutate `0.1.0` in place. No auto-update, ever.

`generated/catalog.json` is the worker-importable bake of the **latest**
version of each name (`src/generated/catalog.json`). Drift against
recipes/ fails the same gate (`pnpm --filter @sfab-lite/registry bake`).

## What a recipe may target (draft — owner ratification)

Applied migrations are an immutable ledger (ADR-0005: `db:generate` is
offline; CD applies by id and hash). A credit-ledger recipe wants a
table, not a row in that ledger.

**Recipes may copy schema source under `src/db/` (and ordinary
`src/` files). They must not target `migrations/` or `migrations/meta/`.**
The validator refuses those targets. Schema lands via `add`;
`db:generate` produces the SQL. If a schema target already exists with
a different hash, collision refusal applies — the agent composes, `add`
does not merge files.

This is the same shape as the RFC's §10 drafted decisions: written here
so the owner can ratify or replace it before later PRs bake it in.

## Recipes in this milestone

Extracted from the starter's shared UI so PR 8 can assemble the starter
from the registry. Targets are the RFC §2 tree (`src/components/ui/`,
`src/lib/`), not today's `src/ui/*`.

| Name | Why it survives the starter rebuild |
| --- | --- |
| `lite/utils` | `cn()` — every primitive depends on it |
| `lite/button` | primary actions on party / ledger forms |
| `lite/label` | labeled controls; Field composes it |
| `lite/input` | create/edit fields |
| `lite/field` | form layout the plan's party-form assumes |
| `lite/card` | detail / balance tiles |
| `lite/table` | party list, open balances, ledger lines |

## Hosted `add`

`factory/host` `POST /api/protected/apps/:appId/add` and MCP `apps_add`
copy source and write `manifest.recipes` (`{ version, files: { path:
sha256 } }`). Collision: a target that exists with a different hash is
refused, never overwritten.
