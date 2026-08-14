# 2026-08-14 — App format RFC implementation

Non-authoritative (see [`README.md`](README.md)). The contract is
[`../architecture/APP-FORMAT.md`](../architecture/APP-FORMAT.md).
Direction: milestone item 2 in
[`2026-08-12-lite-evolution-direction.md`](2026-08-12-lite-evolution-direction.md).

**Status:** drafted (PR #131). Schema + gate landed; snapshot emit /
check units / generated pins are specified, not built.

This is the implementation trail for the RFC PR — decisions the plan
left open, what fought, and what was left out. If it disagrees with
the RFC, the RFC wins.

## What landed

- RFC at `docs/architecture/APP-FORMAT.md` (architecture, not a note:
  later PRs implement this file).
- Types + validator in `framework/toolchain`
  (`manifest.ts`, `validate-manifest.ts`, `adapter.ts`).
- `pnpm check:manifest` — starter must pass; committed red fixture
  must fail. Wired into pre-commit and CI next to `check:direction`.
- `starters/erp/manifest.json` is v0 (new fields around the packer
  core). Seed rebaked.

Did not implement snapshot emit, hash store, check units, or generated
`package.json` / `tsconfig` / `index.html`. Those stay specified.

## Decisions the plan left open

Exact names were the RFC's job. Drafted as follows.

### Field names — packer-superset, not `entries`

The direction note's JSONC used `entries.{server,client,html,styles,schema}`.
The factory already reads `TEMPLATE_MANIFEST.server.entry`,
`client.entry`, `client.styles`, `schema`, `migrations`, `safelist`
from six compile / check / pack sites. Renaming in this PR would have
been a factory rewrite with no behavior change, before the starter
rebuild moves the *paths*. v0 keeps the working names and adds
`format`, `name`, `runtime`, `adapter`, `html`, `capabilities`,
`modules`, `recipes`.

### RFC path — architecture from day one

`docs/notes/` is non-authoritative; this document is the contract
every later PR implements. Graduation-by-move after M1 would have
left the format in a note while PRs 4–6 were bound to it. Pointers
added from `docs/README.md`, `OVERVIEW.md`, `terminology.md`,
`AGENTS.md`.

### Schema location — `framework/toolchain`

Matches the future-repo map (toolchain owns the format). The
direction gate forbids `framework/` from importing `starters/` or
`factory/`, so the validator never reads the starter; the *gate*
(`scripts/check-manifest.mjs`) does.

### Runtime line — `^0`, not `^1`

`KERNEL_VERSION` is still `0.4.0`. Seeding `"runtime": "^1"` would
have been a lie. Schema: `^` plus an integer (`^\d+$`). Exact
semver, `^1.0.0`, `>=1`, `*` all fail. Recipe and module versions
are exact records; the runtime line is the one exception, as
decision 2 already said.

### Adapter methods — `target`, `pack`, `bindings`

As the direction note. HTTP entry is implied by the target
(Cloudflare: LOADER). No extra methods (`htmlShell`, `isolate`,
`serveEntry`) — those are the leaks a second adapter would attack,
and inventing them now would pretend portability is designed.

Types live in `adapter.ts` and are exported. Nothing implements
them. Property-style signatures (`pack: (image) => …`) to satisfy
Biome; the RFC snippet matches.

### Snapshot paths — `src/generated/api.d.ts` + `api.hash`

Sibling hash file rather than a header comment in the `.d.ts`, so
the client unit can refuse to start without parsing types. Under
`src/generated/` so agents have a directory they must not edit.
Not app-root `api.d.ts` (too easy to treat as owner-authored).

### Check-run shape — three sync units, in-memory I/O

Invariant 7's obligation: write down how unit ordering coexists
with sync `runCheck`. The RFC's rule: `runUnit` stays synchronous;
dispose in the same turn before any `await`; emit writes into the
files map; the host persists `api.d.ts` / `api.hash` *after* the
run returns (that persist may be async). Incremental LanguageService
reuse across runs is an optimization for the plumbing PR, not a v0
requirement.

### `html` is named, not seeded

The eject test failed on empty `package.json` before it could fail
on missing `index.html`. The starter's `app/index.html` exists for
standalone Vite and is in `source.exclude` spirit (comment: "not
part of the seed"). v0 requires the `html` field so the path is
format; `check:workspace` asserts the file exists on disk; pack.mjs
does **not** add it to `source.files`. Putting it in the seed now
would ship a standalone-only shell into every hosted app. Generated
membership is the image PR.

### `root` stays

Starter-package packaging (`app/` under `starters/erp`). A hosted
app's tree *is* the root; seeded apps inherit `"root": "app"`.
Documented leak. Stripping it from the packed manifest would change
seed meaning without a consumer that ignores it yet.

### Capabilities / modules / recipes

Empty arrays / object required (not omit-the-key). Recipe keys must
be `lite/<slug>` so bare names never reach a resolver. File hashes
`sha256:` + 64 lowercase hex. Unknown keys fail at every object the
schema names.

### Host-authoritative

`format`, `runtime`, `recipes`. Generated files are host-authoritative
by path convention, not by extra manifest fields — apps do not choose
where they live.

### Red fixture

`scripts/fixtures/manifest-red/manifest.json` is a near-valid v0
manifest with `"name": "${APP_NAME}"`. Interpolation is the crack
the plan warned about (expression syntax). The gate requires that
specific failure, not merely "any schema error" — a validator that
stopped checking strings would still reject a broken fixture for
some other reason and look green.

## What fought

- **Node strip-types vs `.js` specifiers.** Toolchain source uses
  NodeNext (`.js` in imports, files are `.ts`). `node --test
  --experimental-strip-types` does not rewrite `.js` → `.ts` on
  *value* imports. Factory tests avoid this because they import `.ts`
  entry points whose remaining local imports are `import type`
  (erased) or packages. First attempt: `.ts` specifiers in the
  validator + `allowImportingTsExtensions`. That broke
  `@sfab-lite/lint` typecheck — consumers typecheck toolchain
  *source* under *their* tsconfig, which does not allow `.ts`
  extensions. Fix: validator uses `import type` from `./manifest.js`
  and keeps `FORMAT` / `TARGETS` as local literals (the green test
  uses `MANIFEST_FORMAT` from `manifest.ts`, so a drift fails).
- **Biome on the new files.** Method-style interface members,
  `delete`, template-looking strings (`"${APP_NAME}"` in a test),
  inline regexes, export order, `else if (!…)`. All mechanical.
  Interpolation test builds the `${` sequence at runtime so the
  source is not a fake template string.
- **Seed rebase.** Manifest is embedded verbatim in
  `starters/erp/generated/seed.json`. Editing v0 fields without
  `bake-seed` fails `check:seed` with every other gate green — the
  exact pattern making-it-fit warns about.
- **Did not touch `factory/lint`.** Upload cap still 95.4%. Schema
  lives in toolchain; the lint worker is unchanged.

## What the schema does not enforce

By design, so the current starter validates:

- Target tree paths (`src/server.ts` vs today's `src/hono/index.ts`).
  Path strings are opaque. The starter rebuild changes data, not
  schema.
- That generated files exist or are actually generated.
- That `root` is `"."` for hosted apps.
- Import-map closedness (closed-resolve PR).

## Gate shape

`check:manifest` is a sibling of `check:direction`, not folded into
`check:workspace`. Workspace still asserts declared paths exist
(now including `html`). Schema is "is this JSON v0"; workspace is
"do those paths exist on disk". Two questions, two gates, each with
a red path (`manifest-red` / `direction-red`).

14 unit tests in `framework/toolchain` cover the field rules; the
root gate covers the starter + the one interpolation fixture.

## Does not imply

- That eject copy-out works once `html` is named. Still not seeded,
  still empty `package.json` pins. Same protocol as
  [`2026-08-13-eject-copy-out.md`](2026-08-13-eject-copy-out.md).
- That check units are wired. The RFC is the written reconciliation
  of invariant 7; the worker still runs one program.
- That `hc<ApiType>` already points at `src/generated/api.d.ts`.
  The starter still does `import type { ApiType } from "../../hono"`.

## Follow-ups

Owner reads the RFC (checkpoint 2). Then: closed resolve, types
pack, check plumbing — in that order, consuming this format.
Snapshot regen is a separate pass or per-edited-module, not
accumulation on the fit-constrained server unit.
