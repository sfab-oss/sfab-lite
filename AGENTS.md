# AGENTS.md — sfab-lite

House rules for agents working in this repo.

## What this is

Production lite factory monorepo. Architecture was measured in the
`explore-edge-native-lite` exploration (agent-workspace archive); do not
relitigate those verdicts.

Settled shape (T5):

- **Host + AppDO** per app (files / versions / pointer / SQLite via ScopedSql)
- **LOADER** child isolates for serve
- **Plain async check worker** (~13s honest); publish gated on pass
  (CheckDO refuted)
- **Stateless Biome lint worker** (sync on edit)

Evidence: agent-workspace `archive/explore-edge-native-lite/artifacts/t5/`.

## Layout

| Path | Role |
| --- | --- |
| `apps/factory` | Host worker + factory UI (admin API, serve, publish) |
| `apps/check` | Pruned TS check worker |
| `apps/lint` | Biome lint worker |
| `packages/template` | Starter-lite seed; independently runnable; kernel-closure source |
| `packages/kernel` | Frozen universe + prebuild (types VFS, client chunks) |
| `packages/core` | Shared contracts |

Package names: `@sfab-lite/*`.

## Hard boundaries

1. **Apps are data; the factory is ordinary software.** Sub-apps run inside
   the frozen kernel. The factory UI is fixed software — full UI/registry
   stack is allowed there. The frozen-kernel constraint applies only to
   sub-apps.
2. **Biome is the house linter — never ESLint.**
3. **Secrets hygiene.** Use `.dev.vars` (and similar) locally; they are
   gitignored. Never commit secrets, tokens, or production credentials.
4. **No wrangler remote / prod deploys** unless the owner explicitly asks.
5. **Registry blocks are the design source** for factory UI (S3+): follow
   sfab `packages/registry/registry/blocks/*-next/` patterns; implement only
   what the lite loop needs.

## Tooling

- pnpm workspace (`apps/*`, `packages/*`)
- TypeScript strict via root `tsconfig.base.json`
- CI on Blacksmith: workspace integrity + typecheck + biome

## License

AGPL-3.0-only (same posture as the sfab platform).
