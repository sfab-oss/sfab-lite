# @sfab-lite/starter-base

Default create seed: auth + inset shell + empty home. No ERP domain.

This package wears two hats, and the directory split is the whole design:

| Path         | What it is                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------- |
| `app/`       | **the payload** — the source tree seeded into a new app. Also runs standalone from right here. |
| `generated/` | `seed.json` — the baked pack output the factory imports as a bundle constant.                  |
| `src/`       | the package the factory imports. Today: `TEMPLATE_MANIFEST`.                                    |
| `scripts/`   | `pack.mjs` / `bake-seed` / `generate-format-files.mjs`.                      |

Everything outside `app/` is scaffolding for us. Everything inside `app/`
is the ordinary single-project tree a new app starts as.

## What the app does

- better-auth + app organizations + onboarding
- Inset sidebar shell, settings, auth screens
- Overview: welcome + empty state
- Schema: `0001_auth` only (`src/db/schema.ts` re-exports `auth.ts`)
- Org-protected mount is empty — agents `.route()` resources onto it

URLs: `/`, `/sign-in`, `/sign-up`, `/onboarding`, `/overview`, `/settings`.

## Seeded app layout

| Path | Role |
| --- | --- |
| `package.json` | **Generated** — exact runtime pins from `generateFormatFiles`. Drift-gated by `pnpm check:generated`. Do not hand-edit. |
| `tsconfig.json` | **Generated** — same regime (`types: []`, `include: ["src"]`). |
| `biome.json` | Injected at pack from `framework/toolchain/app-biome.json`. |
| `components.json` | **Generated** — `@lite` → `https://lite.sfab.dev/r/{name}.json`. |
| `index.html` | **Generated** — document shell. |
| `src/db/` | Schema barrel `schema.ts` re-exports `auth.ts` only. |
| `migrations/` | `0001_auth` + kit meta for that schema. |
| `src/server.ts` | Hono export `app`. |
| `src/hono/` | API tiers: `public/` / `protected/` / `org-protected/` (empty mount). |
| `src/routes/` | File routes; pages live here. |
| `src/components/ui/` | Registry recipes from `BASE_SEED_RECIPES` (sidebar shell; no table/dialog/badge). |

## Run it standalone

```sh
cp .dev.vars.example .dev.vars      # then put a ≥32-char secret in it
pnpm --filter @sfab-lite/starter-base db:migrate
pnpm --filter @sfab-lite/starter-base dev
```

## Bake / assemble

```sh
pnpm --filter @sfab-lite/registry assemble-base-starter
pnpm --filter @sfab-lite/starter-base generate
pnpm --filter @sfab-lite/starter-base generate-routes
pnpm --filter @sfab-lite/factory exec node --experimental-strip-types scripts/bake-template-snapshot.mjs --starter=base
pnpm --filter @sfab-lite/starter-base bake-seed
```

Payload rules: keep the format floor; do not grow ERP domain into base. Add-only recipes stay out of `BASE_SEED_RECIPES` until intentionally seeded.
