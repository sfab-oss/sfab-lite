# @sfab-lite/starter-heavy

Named **heavy** starter — ERP domain floor plus every published `@lite`
catalog recipe imported from `/gallery`. Probe seed for host gzip and
check-client cost; default create stays `@sfab-lite/starter-base`.

| Path | Role |
| --- | --- |
| `app/` | Seed payload (standalone + factory seed). |
| `generated/seed.json` | Baked pack the host imports. |
| `src/` | Package surface (`TEMPLATE_MANIFEST`). |
| `scripts/` | pack / bake-seed / generate-format-files. |

## Bake

```sh
pnpm --filter @sfab-lite/registry assemble-heavy-starter
pnpm --filter @sfab-lite/starter-heavy generate
pnpm --filter @sfab-lite/starter-heavy generate-routes
pnpm --filter @sfab-lite/starter-heavy bake-seed
```

`HEAVY_SEED_RECIPES` is the full published catalog (`catalogNames(CATALOG)`).
The gallery route is the client-root reachability surface for those UI
modules — do not leave assembled files unused under `src/components/ui/`.

## Standalone

Same shape as ERP: `.dev.vars`, `db:migrate`, `dev` (API 8787 + Vite 5173).
