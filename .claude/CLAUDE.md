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
`pnpm check:workspace`, `pnpm check:app-lint`, `pnpm check:kernel`,
`pnpm check:cycles`, `pnpm check:dead-code`, `pnpm check:seed`,
`pnpm check:check-memory`.

`check:app-lint` is the odd one: it checks `packages/template/app/src` —
the seed payload — against `packages/core/app-biome.json`, the config the
factory's lint worker applies to app sources. That config cannot `extends`
the shared preset (the worker runs Biome in WASM, which has no package
resolution), so this gate is what keeps the two from drifting and a
freshly seeded app from lighting up on code its owner never touched.

`check:kernel` rebuilds `@sfab-lite/kernel` from its isolated
`packages/kernel/universe` install and fails if committed vendor /
generated / `kernel.json` artifacts drift.

`check:seed` is the same idea for `apps/factory/src/generated/seed.json`:
re-runs the template pack and fails if the committed seed no longer matches
`packages/template/app/src`. The seed is a bundle constant because the host
Worker has no filesystem, so editing the template without re-baking would
leave every other gate green while the factory kept seeding the old source.

`check:check-memory` runs the check worker over six distinct appIds in one
process and fails if its LanguageService store holds more than one app or if
the heap grows. **One TS program over the types VFS retains ~263 MB and a
Worker isolate gets 128 MB on every plan**, so the check worker can afford
state for exactly one app at a time. Treat that as a standing budget when
touching `apps/check/src`: anything cached per app, and anything that grows the
types VFS, spends against it. `apps/check/scripts/measure-memory.mjs` is the
diagnostic that produced these numbers and re-derives them on demand.

Part of that budget is bought by
`packages/kernel/scripts/trim-drizzle-dialects.mjs`, which drops drizzle's pg /
mysql / gel / singlestore dialects from the types VFS during the closure build.
Sub-apps run on D1, so those dialects are unreachable — but TypeScript still
loaded all four to resolve conditional-type branches it would never take, at a
cost of 232 source files and 67 MB. That trim carries two build-time
assertions; if either fires, re-derive the trim rather than deleting the gate.
The whole story, including five approaches that were measured and rejected, is
in [`docs/notes/2026-07-25-check-worker-memory.md`](docs/notes/2026-07-25-check-worker-memory.md).

**Anything memory-related must be verified in production.** Local workerd
applies no memory limit, so `wrangler dev` cannot observe an OOM at all — use
`wrangler tail --format json` against a real deploy and count `exceededMemory`.

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
typecheck → cycles → knip → kernel. Pre-push blocks `main`. CI on Blacksmith
runs the same gates.

## License

AGPL-3.0-only.
