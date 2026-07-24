# AGENTS.md — sfab-lite

Tier-1 entry point for anyone — human or AI agent — working in this repo.
Commands + conventions + the index into everything else; follow the links
for detail.

> `AGENTS.md` and `.claude/CLAUDE.md` are kept **byte-identical** — mirrored as
> real copies, not a symlink, since some tools don't auto-read a symlinked
> instructions file. Change one, copy it over the other.

## What this is

Production **lite factory** monorepo. Architecture was measured in the
`explore-edge-native-lite` exploration; do not relitigate those verdicts.
Authoritative summary: [`docs/architecture/OVERVIEW.md`](docs/architecture/OVERVIEW.md).

**Lite** = hosted template / frozen-kernel sub-apps. The factory monorepo
tooling matches starter/platform — not skimpy.

Settled shape (T5): host + AppDO per app; LOADER serve isolates; plain async
TS check worker (publish gated); stateless Biome lint worker. Evidence in
agent-workspace `archive/explore-edge-native-lite/artifacts/t5/`.

## Commands

Run from the **monorepo root**:

| Task | Command |
| --- | --- |
| Type check | `pnpm typecheck` |
| Format + lint (fix) | `pnpm lint:fix` |
| Lint (check only) | `pnpm lint:check` |
| Workspace integrity | `pnpm check:workspace` |
| Import cycles | `pnpm check:cycles` |
| Dead code (knip) | `pnpm check:dead-code` |
| Tests | `pnpm test` |
| Build | `pnpm build` |

## Layout

| Path | Role |
| --- | --- |
| `apps/factory` | Host worker + factory UI (admin API, serve, publish) |
| `apps/check` | Pruned TS check worker |
| `apps/lint` | Biome lint worker |
| `packages/template` | Starter-lite seed; independently runnable; kernel-closure source |
| `packages/kernel` | Frozen universe + prebuild (types VFS, client chunks) |
| `packages/core` | Shared contracts |
| `packages/tsconfig` | Shared TS configs (`@sfab-lite/tsconfig`) |
| `packages/biome-config` | Shared Biome presets (`@sfab-lite/biome-config`) |

Package names: `@sfab-lite/*`.

## Where things live (index)

- **What the system is** → [`docs/architecture/OVERVIEW.md`](docs/architecture/OVERVIEW.md)
- **Why a choice was made** → [`docs/decisions/`](docs/decisions/)
- **Working notes** → [`docs/notes/`](docs/notes/)
- **Procedural domain knowledge, loaded on demand** → [`.agents/skills/`](.agents/skills/)
  (`wrangler`, `cloudflare`, `durable-objects`, `workers-best-practices`,
  `ai-sdk`, `agent-browser`, `shadcn`, `tanstack-start-best-practices`,
  `find-skills`). Use the relevant skill when a task matches its domain.
  Symlinked into `.claude/skills/` for Claude Code. Locked via
  [`skills-lock.json`](skills-lock.json).

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

- pnpm workspace (`apps/*`, `packages/*`); Turbo for typecheck/build/test/dev
- TypeScript via `@sfab-lite/tsconfig`; Biome via `@sfab-lite/biome-config`
- Husky pre-commit (platform-closer): lint-staged → workspace → typecheck →
  cycles (madge) → dead-code (knip). Pre-push blocks direct pushes to `main`.
- CI on Blacksmith: workspace + typecheck + biome + cycles + dead-code

## License

AGPL-3.0-only (same posture as the sfab platform).
