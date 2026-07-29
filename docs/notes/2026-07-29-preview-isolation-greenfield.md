# Preview isolation greenfield — local reset

After pulling `feat/preview-isolation` (or main once merged), wipe local
factory state. There is no migration of bare-`appId` AppDO SQLite onto
`${appId}:live` / AppCreateDO.

1. Stop `wrangler` / Vite for the factory worktree.
2. Delete local wrangler state for this worktree:
   `rm -rf apps/factory/.wrangler`
3. Recreate D1 migrations:
   `cd apps/factory && pnpm exec wrangler d1 migrations apply sfab-lite-factory --local`
4. Restart factory; create a new app (old apps are gone with `.wrangler`).

Glossary: **AppDataDO** (runtime SQLite per serve target) · **AppCreateDO**
(create jobs + alarms) · live `${appId}:live` · preview `${appId}:pr:N` ·
reserved `${appId}:ws:…`. Never call our concepts "Artifacts".
