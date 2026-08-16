# ADR-0010: The runtime's type surface is generated independently of any one app, and the check runs as units

**Status:** Accepted
**Date:** 2026-08-15
**Deciders:** Alwurts

## Context

Before this decision the types VFS was closure-pruned against the
starter's own program and the runtime's pins were read from the
starter's `package.json`: the framework was *derived from the starter*
— the inverse of every boundary in the plan, and invisible to an
import-graph gate. Closure pruning worked because there was exactly one
app shape; a registry's whole purpose is N shapes, and every recipe that
reached surface the starter never touched would fail on legitimate API
or force another whole-package exception (the `@base-ui/react`
exception cost 22 → 373 loaded files).

Separately, the whole-app union check was over the 128 MB isolate
ceiling locally (340 MB retained). The falsification experiments are the
record: zones did not fit; stacked typed stubs + shallow RPC did not fit
the union (255 MB); a production tail matrix showed the 255 MB
cheap-surface single program at **4/50 `exceededMemory`** while each
unit was 0/50 ([`../engineering/making-it-fit.md`](../engineering/making-it-fit.md),
"Measured and rejected", "Prod tail matrix", "Check units shipped").

## Decision

- **Independence.** The runtime owns its pins (`framework/runtime/scripts/pins.mjs`)
  and its universe; the starter conforms (`check:workspace`), never the
  reverse.
- **Generated, accurate, cheap vendor type surfaces**, owned by the
  runtime (the types pack). They are gated by an **agreement gate**:
  cheap surface and real types must produce identical verdicts over the
  starter plus recipes, and planted errors must be caught by both
  (`check:drizzle-agreement`, `check:export-agreement`).
- **The client edge is a snapshot, not live inference.** The server's
  API type is emitted once as a standalone `src/generated/api.d.ts`
  keyed to `src/generated/api.hash` (sha256 of the server tree). The
  client types `hc<ApiType>` against that file, never `typeof` the live
  server. A stale hash is a hard client-check failure (`LITE-SNAPSHOT`,
  9001). Auth routes are excluded; the auth client types that edge.
- **The check runs as three ordered synchronous units** — server →
  snapshot emit → client-vs-snapshot — with the LanguageService disposed
  between them. The whole-app union is not the unit that fits.
- **The memory gate is an absolute per-app ceiling measured in
  production** (`wrangler tail`, counting outcomes on the live check
  worker) — not a per-recipe budget. Local heap ranks nothing.

## Consequences

### Positive

- The live check worker went from a measured 1-in-4 create failure to
  0/8 across three re-tails (baseline, units, post-starter-rebuild) with
  recipes in the checked tree.
- New recipes cannot silently depend on surface the runtime does not
  serve; closed resolve is enforced at check with an agent-grade
  diagnostic.

### Negative

- Two type surfaces exist for the runtime's vendors (cheap + real); the
  agreement gate is what keeps them honest, and it must run on every
  change to either.
- Local product-path unit heaps (243 / 248 / 319 MB) sit above the
  ceiling on paper and did not predict isolate death — local numbers
  are not claims.

### Mitigations

- Re-tail whenever the checked tree or the check path changes materially;
  the notes catalogue in `making-it-fit.md` records each run.

## Related

- [ADR-0004](0004-trim-unreachable-vendor-surface.md), [ADR-0006](0006-base-runtime-is-platform-resolved.md)
- [`../architecture/APP-FORMAT.md`](../architecture/APP-FORMAT.md) §4–§5
- Experiment notes (2026-08-13/14) linked from `making-it-fit.md`
