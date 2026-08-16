# ADR-0007: The repo transforms in place; harness depends on framework, never the reverse

**Status:** Accepted
**Date:** 2026-08-15
**Deciders:** Alwurts

## Context

Turning the experiment into a lite framework needed a home. A curated
copy into a new repo was considered and rejected: it loses provenance
while the contracts are still moving, and the asset worth preserving is
the **measured knowledge** — [`../engineering/making-it-fit.md`](../engineering/making-it-fit.md),
the gates, the refuted ideas — not the code. Existing framework-side
code is inspiration and may be deleted or rewritten freely.

That only works if the boundary between "the framework" and "the thing
that exercises it" is enforced, and `check:cycles` (madge) finds cycles,
not one-way violations.

## Decision

Everything in this repo is one of two things:

- **Framework-side** — `framework/{runtime,toolchain}`, `registry/`,
  `starters/` — what the future-repo map marks extractable.
- **Harness** — the testing and reference surface around it: factory
  console UI, chat/agent API, workspaces, check/lint workers'
  factory-specific wiring.

**Harness depends on framework, never the reverse.** `check:direction`
(a dependency allowlist gate with a red fixture) enforces it in CI.
The transformation is **source-only**: moving Durable Object classes to
a separate worker is a live-data migration, priced separately if ever.

Five measured behaviours are enforced only by code shape; any rewrite
must carry them and red-test the gates that protect them:

1. `runCheck` is synchronous — async lets two programs coexist and
   re-OOMs the isolate while every gate stays green.
2. `CHECK_ATTEMPTS = 2` is a wall-clock budget — four attempts measurably
   made creates worse.
3. The create alarm is re-armed *before* the run — that is the entire
   kill-recovery mechanism.
4. The `@base-ui/react` whole-package exception is load-bearing
   ([ADR-0004](0004-trim-unreachable-vendor-surface.md)).
5. The drizzle trim's two build-time assertions stay.

Two more joined with the units architecture
([ADR-0010](0010-runtime-type-surface-independent-and-checked-in-units.md)):

6. Snapshot freshness is structural, not disciplined — `api.d.ts` is
   keyed to a hash of the server tree and a client check never runs
   against a different hash.
7. Unit ordering (server emits before any client consumes) is
   reconciled with the sync-`runCheck` invariant in the format contract,
   in writing.

## Consequences

### Positive

- Extraction of the framework into its own repo is a `git mv` when the
  contracts stop moving; nothing in the harness can have leaked into it.
- The invariant inventory makes rewrites reviewable: "did behaviour
  change?" has a checklist.

### Negative

- Harness code that would be simpler with a shortcut into the framework
  cannot take it.

### Mitigations

- The gate has a red fixture; a violation fails CI with the edge named.

## Related

- [`../architecture/OVERVIEW.md`](../architecture/OVERVIEW.md) (hard distinction: factory is ordinary software, sub-apps are data)
- [ADR-0002](0002-monorepo-tooling-not-product-lite.md)
