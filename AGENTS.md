# AGENTS.md — sfab-lite

House rules and index for this repo.

> `AGENTS.md` and `.claude/CLAUDE.md` are kept **byte-identical** — mirrored as
> real copies, not a symlink. Change one, copy it over the other.

## What this is

Edge-native **lite factory**: host + check + lint workers, frozen kernel, and
starter-lite template. Packages are `@sfab-lite/*`.

**Lite** means the hosted template / frozen-kernel sub-apps — not skimpy
factory tooling. Architecture:
[`docs/architecture/OVERVIEW.md`](docs/architecture/OVERVIEW.md).

## Commands

From the monorepo root: `pnpm typecheck`, `pnpm lint:check`, `pnpm lint:fix`,
`pnpm check:workspace`, `pnpm check:app-lint`, `pnpm check:cycles`,
`pnpm check:dead-code`.

`check:app-lint` is the odd one: it checks `packages/template/app/src` —
the seed payload — against `packages/core/app-biome.json`, the config the
factory's lint worker applies to app sources. That config cannot `extends`
the shared preset (the worker runs Biome in WASM, which has no package
resolution), so this gate is what keeps the two from drifting and a
freshly seeded app from lighting up on code its owner never touched.

## Layout

| Path | Role |
| --- | --- |
| `apps/factory` | Host worker + factory UI |
| `apps/check` | TypeScript check worker |
| `apps/lint` | Biome lint worker |
| `packages/template` | Starter-lite seed in `app/` (independently runnable) |
| `packages/kernel` | Frozen universe + prebuild |
| `packages/core` | Shared contracts |
| `packages/tsconfig` | Shared TS configs |
| `packages/biome-config` | Shared Biome presets |

## Where things live

- Docs (architecture, ADRs, notes) → [`docs/`](docs/)
- Skills (on demand) → [`.agents/skills/`](.agents/skills/) — `wrangler`,
  `cloudflare`, `durable-objects`, `workers-best-practices`, `ai-sdk`,
  `agent-browser`, `shadcn`, `tanstack-start-best-practices`, `find-skills`
  (symlinked under `.claude/skills/`; locked in `skills-lock.json`)

## Hard boundaries

1. **Apps are data; the factory is ordinary software.** The frozen-kernel
   constraint applies only to sub-apps. Factory UI may use the full stack.
2. **Biome only — never ESLint.**
3. **Never commit secrets** (`.dev.vars` and similar are gitignored).
4. **No wrangler remote / prod deploys** without an explicit owner ask.
5. **Registry blocks** are the design source for factory UI (S3+); implement
   only what the lite loop needs.

## Tooling

pnpm workspace + Turbo; shared `@sfab-lite/tsconfig` and
`@sfab-lite/biome-config`. Pre-commit: lint-staged → workspace → app-lint →
typecheck → cycles → knip. Pre-push blocks `main`. CI on Blacksmith runs the
same gates.

## License

AGPL-3.0-only.
