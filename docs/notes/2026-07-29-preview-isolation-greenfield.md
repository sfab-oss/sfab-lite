# Preview isolation greenfield — wipe / reset

After pulling `feat/preview-isolation` (or main once merged), wipe factory
state. There is no migration of bare-`appId` AppDO SQLite onto
`${appId}:live` / AppCreateDO. Wrangler migration `v5` deletes the `AppDO`
class and creates `AppDataDO` + `AppCreateDO` — existing DO storage for the
old class is destroyed.

## Local

1. Stop `wrangler` / Vite for the factory worktree.
2. Delete local wrangler state for this worktree:
   `rm -rf apps/factory/.wrangler`
3. Recreate D1 migrations:
   `cd apps/factory && pnpm exec wrangler d1 migrations apply sfab-lite-factory --local`
4. Restart factory; create a new app (old apps are gone with `.wrangler`).

## Remote (deploy of v5)

Deploying the worker applies `deleted_classes: ["AppDO"]` and new
`AppDataDO` / `AppCreateDO` bindings. Cloudflare drops all AppDO SQLite;
**D1 registry rows are not wiped automatically.** Live pointers, PR rows,
and org UI will still name apps whose `:live` / create DOs are empty —
a silent half-wipe.

Treat existing apps as dead after this deploy:

1. Wipe or re-migrate factory D1 (same schema apply path you use for a
   fresh remote DB), **or** delete every app row and recreate apps from the
   console.
2. Confirm CODE_R2 / KERNEL_R2 buckets are still the ones you intend (they
   are not cleared by the DO migration).
3. Create new apps; do not expect pre-cutover app ids to serve.

Glossary: **AppDataDO** (runtime SQLite per serve target) · **AppCreateDO**
(create jobs + alarms) · live `${appId}:live` · preview `${appId}:pr:N` ·
reserved `${appId}:ws:…`. Never call our concepts "Artifacts".
