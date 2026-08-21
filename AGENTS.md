# AGENTS.md — sfab-lite

House rules and index for this repo.

> `AGENTS.md` and `.claude/CLAUDE.md` are kept **byte-identical** — mirrored as
> real copies, not a symlink. Change one, copy it over the other.

## What this is

Edge-native **lite factory**: host + check + lint + build workers, frozen kernel, and
starter packages (`base`, `erp`, `heavy`). Packages are `@sfab-lite/*`.

**Lite** means the hosted template / frozen-kernel sub-apps — not skimpy
factory tooling. Architecture:
[`docs/architecture/OVERVIEW.md`](docs/architecture/OVERVIEW.md). Naming (factory
vs app plane, reserved words):
[`docs/engineering/terminology.md`](docs/engineering/terminology.md).

## Commands

From the monorepo root: `pnpm typecheck`, `pnpm lint:check`, `pnpm lint:fix`,
`pnpm check:workspace`, `pnpm check:app-lint`, `pnpm check:kernel`,
`pnpm check:cycles`, `pnpm check:direction`, `pnpm check:verb-independence`, `pnpm check:manifest`,
`pnpm check:generated`, `pnpm check:registry`, `pnpm check:pins`, `pnpm check:dead-code`,
`pnpm check:seed`, `pnpm check:drizzle-kit-modules`, `pnpm check:modules`, `pnpm check:route-tree`, `pnpm check:check-memory`, `pnpm check:drizzle-agreement`,
`pnpm check:registry-agreement`.

`check:generated` fails when the generated format files under
`starters/<id>/app/` (`package.json`, `tsconfig.json`, `index.html`,
`components.json`, `src/db/index.ts`, and `src/storage/index.ts` when
the manifest declares storage) drift from `generateFormatFiles`.
Regenerate with `pnpm --filter @sfab-lite/starter-<id> generate`; do not
hand-edit.

`check:registry` validates every published recipe against the lite
profile, fails closed on committed red fixtures (`dependencies` that
are not an exact catalog pin, unknown types, bare names), and refuses
mutation of published version hashes.

`check:registry-agreement` is the cheap-vs-real CLI gate: the pinned
`shadcn` CLI adding every live-catalog recipe from a locally served
`/r/{name}.json` must place files byte-identical to `planAdd`. CI-only
— not in pre-commit. Hashed-but-retired slugs (e.g. `lite/form@0.1.0`)
are not served.

`check:app-lint` is the odd one: it checks every `starters/*/app/src` —
the seed payloads — against `framework/toolchain/app-biome.json`, the
config the factory's lint worker applies to app sources. That config
cannot `extends` the shared preset (the worker runs Biome in WASM, which
has no package resolution), so this gate is what keeps them from
drifting and a freshly seeded app from lighting up on code its owner
never touched.

`check:kernel` rebuilds `@sfab-lite/kernel` from its isolated
`framework/runtime/universe` install and fails if committed vendor /
generated / `kernel.json` artifacts drift.

`check:seed` is the same idea for each `starters/<id>/generated/seed.json`:
re-runs that starter's pack and fails if the committed seed no longer matches
`starters/<id>/app/src`. The seed lives in the starter package; the factory
imports seeds at build time because the host Worker has no filesystem. Editing a
starter without re-baking would leave every other gate green while the factory
kept seeding the old source.

`check:drizzle-kit-modules` is the same idea for
`factory/host/generated/drizzle-kit-modules.json`: re-runs
`prepare-drizzle-kit-api.mjs` and fails if the committed map no longer matches
the pinned drizzle-kit / drizzle-orm sources. The host imports the map at build
time for the schema-probe Loader child.

`check:modules` is the same idea for catalog-module artifacts
(`framework/modules/<name>@<version>/` plus the generated stubs JSON):
re-runs the isolated pdf-lib esbuild and fails if committed ESM / stub /
hashes drift. The host must not import the ESM (R2 at serve); check
overlays only the cheap stubs.

`check:route-tree` is the same idea for each
`starters/<id>/app/src/routeTree.gen.ts`: re-runs that starter's
`generate-routes` (`tsr generate` + banner rewrite) and fails if the
committed tree no longer matches `app/src/routes/`. Starter-only — hosted
apps have no `tsr`; agents there edit the gen file by hand together with
the route files.

`check:check-memory` runs the check worker over six distinct appIds in one
process and fails if its LanguageService store holds more than one app, if a
LanguageService is still live after a run returns, or if the heap grows.
A check run is three ordered units (server → emit → client-vs-snapshot) with
the LanguageService disposed between them; **one TS program** still retains
far more than a Worker isolate's 128 MB, so the worker can afford state for
exactly one app at a time. Treat that as a standing budget when touching
`framework/verbs/src/check`: anything cached per app, and anything that grows the
types VFS, spends against it. `factory/check/scripts/measure-memory.mjs` and
`measure:units` are the diagnostics that produced these numbers and re-derive
them on demand.

`check:drizzle-agreement` is the cheap-vs-real types-pack gate: starter
drizzle-using server files must be 0 diagnostics under both the real drizzle
`.d.ts` and the generated sqlite/D1 surface, and the planted
`eq(party.id, 0)` / `name: 123` failures on
`starters/erp/app/src/hono/org-protected/parties.ts` must be caught under
both (codes may differ). Heap is recorded, not gated. It needs
`--max-old-space-size=8192` and several LanguageService programs, so it
runs in CI only — not in pre-commit.

`check:verb-independence` is the consume-as-libraries gate (D-005):
`@sfab-lite/{core,verbs,kernel}` resolve under `framework/`, esbuild-bundle
of lint + check against `starters/base` has zero `factory/` inputs, and a
committed red fixture that imports factory *must* show `factory/` in the
graph (or the detector is blind). Needs kernel universe esbuild and ~10s
for `runCheck`. CI-only — not in pre-commit.

Part of that budget is bought by
`framework/runtime/scripts/trim-drizzle-dialects.mjs`, which drops drizzle's pg /
mysql / gel / singlestore dialects from the types VFS during the closure build.
Sub-apps run on D1, so those dialects are unreachable — but TypeScript still
loaded all four to resolve conditional-type branches it would never take, at a
cost of 232 source files and 67 MB. That trim carries two build-time
assertions; if either fires, re-derive the trim rather than deleting the gate.
Trimming unreachable vendor surface is a sanctioned technique with conditions —
see [ADR-0004](docs/decisions/0004-trim-unreachable-vendor-surface.md).

**Before proposing a fix for a memory, bundle-size or latency problem, read
[`docs/engineering/making-it-fit.md`](docs/engineering/making-it-fit.md).** It
is the catalogue of what worked and what was measured and rejected — shared
DocumentRegistry, VFS pruning, client/server split, `lib.dom` trimming, CheckDO
affinity. Re-deriving those is expensive and they are already refuted with
numbers.

**Anything memory-related must be verified in production.** Local workerd
applies no memory limit, so `wrangler dev` cannot observe an OOM at all — use
`wrangler tail --format json` against a real deploy and count `exceededMemory`.

## Layout

| Path | Role |
| --- | --- |
| `factory/host` | Host worker + factory UI |
| `factory/check` | TypeScript check worker (HTTP shell over `@sfab-lite/verbs/check`) |
| `factory/lint` | Biome lint worker (HTTP shell over `@sfab-lite/verbs/lint`) |
| `factory/build` | Compile worker (HTTP shell over `@sfab-lite/verbs/build`) |
| `factory/ui` | Shared factory UI primitives (shadcn, icons, ai-elements) |
| `starters/base` | Default create seed (`@sfab-lite/starter-base`) |
| `starters/erp` | Named ERP seed (`@sfab-lite/starter-erp`) |
| `starters/heavy` | Named full-catalog gallery seed (`@sfab-lite/starter-heavy`) |
| `framework/runtime` | Frozen universe + prebuild (owns universe pins) |
| `framework/toolchain` | Shared contracts (app-format schema, check/lint wire types, app-biome) |
| `framework/verbs` | Framework verbs: check, lint, build, format overlay |
| `framework/tsconfig` | Shared TS configs |
| `framework/biome-config` | Shared Biome presets |
| `registry/` | Recipes: pinned schema, lite resolver, published versions |

## Where things live

- Docs (architecture, ADRs, notes) → [`docs/`](docs/). App format:
  [`docs/architecture/APP-FORMAT.md`](docs/architecture/APP-FORMAT.md)
- Skills (on demand) → [`.agents/skills/`](.agents/skills/) — `wrangler`,
  `cloudflare`, `durable-objects`, `workers-best-practices`, `ai-sdk`,
  `agent-browser`, `shadcn`, `tanstack-start-best-practices`, `find-skills`
  (symlinked under `.claude/skills/`; locked in `skills-lock.json`)
- Factory console UI tokens / primitives →
  [`factory/host/AGENTS.md`](factory/host/AGENTS.md) (shadcn semantic
  tokens are canonical for new UI)

## Hard boundaries

1. **Apps are data; the factory is ordinary software.** The frozen-kernel
   constraint applies only to sub-apps. Factory UI may use the full stack.
2. **Biome only — never ESLint.**
3. **Never commit secrets** (`.dev.vars` and similar are gitignored).
4. **No wrangler remote / prod deploys** without an explicit owner ask.
5. **Registry blocks** are the design source for factory UI; implement only
   what the lite loop needs.
6. **Do not implement what a library already does.** Use the library directly
   (or copy / vendor / generate from it). Hand-rolled parsers, validators and
   utils are not allowed when a pinned library provides them — validation uses
   zod.

## Tooling

pnpm workspace + Turbo; shared `@sfab-lite/tsconfig` and
`@sfab-lite/biome-config`. Pre-commit: lint-staged → workspace → app-lint →
typecheck → cycles → knip → kernel. Pre-push blocks `main`. CI on Blacksmith
runs the same gates.

## License

AGPL-3.0-only.
