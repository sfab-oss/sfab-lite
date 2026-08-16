# ADR-0012: The framework owns the verbs; the harness composes them

**Status:** Accepted
**Date:** 2026-08-16
**Deciders:** Alwurts

## Context

The vision is that a hosted factory maps the same verbs to workers, so
agents learn one vocabulary. [ADR-0007](0007-harness-depends-on-framework-never-the-reverse.md)
drew the harness → framework arrow and kept the seven measured
invariants, but the implementations of check, lint, and build still
lived in the harness (`factory/check`, `factory/lint`,
`factory/host/src/compile`). `forge/cd.ts` was both the composer and
the only place those implementations met.

Two facts made that placement load-bearing in the wrong direction:

1. The verbs read the **starter's** manifest constant
   (`TEMPLATE_MANIFEST`) for entries, styles, and safelist. A framework
   command depended on one starter, and an app whose manifest differed
   was compiled and typechecked against the wrong paths.
2. Create→ready is ~90 s on a live tail, and only check (~13 s wall)
   was measured. Nobody could say where the rest went.

## Decision

`check`, `lint`, `build`, and the format overlay are framework functions
in `framework/verbs` (`@sfab-lite/verbs`). Each takes a tree (and that
tree's parsed manifest) and returns a result. None of them knows about
PRs, `live_sha`, gates, R2, or Durable Objects.

The harness composes:

- create → CD (lint → build → check → schema → write)
- PR push → CD
- agent workspace → build-on-save (no lint/check) plus on-demand
  `typecheck` / `lint`

**There is no preview verb.** Preview is a harness serve mode over
`build()` of a working tree (`workspace-build.ts` already does this,
debounced 1 s on write).

**User-defined scripts are not run by the host** (owner, 2026-08-16).
The manifest stays data-only ([ADR-0008](0008-declarative-manifest-no-app-plugin-system.md));
the host runs framework verbs only.

**At eject the verbs map to stock tools by construction.** The generated
`package.json` gets a fixed `scripts` block (`dev`, `check` =
`tsc --noEmit`, `lint` = `biome check`, `build` = `vite build`,
`deploy` = `wrangler deploy`). Nothing is published. The lite-specific
parts of every verb — units, snapshot, closed resolve, image — exist
because of the 128 MB host and the closed world, and are not needed
off-host. Eject stays a bound, not a feature
([ADR-0011](0011-eject-rule.md)); shipping that `scripts` block is a
follow-up, not this PR.

CD records stage timings (`lintMs`, `buildMs`, `checkMs`,
`checkAttempts`, `schemaMs`, `writeMs`, `totalMs`) on every completed
check-run, success and failure, so the next re-tail can attribute
create→ready without new instrumentation.

## Consequences

### Positive

- One vocabulary: agents, CD, and workspace compile call the same
  functions.
- The harness is free to reorder or skip stages (workspace compile
  already skips lint/check).
- Verbs are testable without a worker isolate.

### Negative

- A fourth framework package (`@sfab-lite/verbs`) that must stay pinned
  with the rest of the workspace.

### Mitigations

- `check:direction` keeps `framework/` from importing the harness or a
  starter. Verbs read the tree's manifest; `KERNEL_PATHS` lives on the
  kernel.
- The ADR-0007 invariant gates (`check:check-memory`, factory/check
  tests, `check:template-snapshot`, `check:export-agreement`,
  `check:drizzle-agreement`, `check:workspace`, `check:kernel`) move
  with the code, unchanged.

## Related

- [ADR-0007](0007-harness-depends-on-framework-never-the-reverse.md),
  [ADR-0008](0008-declarative-manifest-no-app-plugin-system.md),
  [ADR-0010](0010-runtime-type-surface-independent-and-checked-in-units.md),
  [ADR-0011](0011-eject-rule.md)
- [`../architecture/APP-FORMAT.md`](../architecture/APP-FORMAT.md) §4, §7
