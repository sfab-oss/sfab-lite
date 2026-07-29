# Code host greenfield — local reset

After pulling `feat/code-host-foundation` (or main once merged), wipe local
factory state. There is no migration of AppDO version trees.

1. Stop `wrangler` / Vite for the factory worktree.
2. Delete local wrangler state for this worktree:
   `rm -rf apps/factory/.wrangler`
3. Recreate D1 migrations (includes `0004_app_live_sha.sql`):
   `cd apps/factory && pnpm exec wrangler d1 migrations apply sfab-lite-factory --local`
4. CODE_R2 is simulated locally by wrangler (binding `CODE_R2`, remote bucket
   name `sfab-lite-code`). No manual bucket create is required for
   `wrangler dev`. For remote deploy once:
   `wrangler r2 bucket create sfab-lite-code`
5. Restart factory; create a new app (old apps are gone with `.wrangler`).

Glossary: code host / repo / build / live / forge / workspace / AppDO —
never call our concepts "Artifacts".
