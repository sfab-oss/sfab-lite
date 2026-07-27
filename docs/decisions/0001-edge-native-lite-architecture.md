# ADR-0001: Edge-native lite architecture (host + AppDO + check + lint)

**Status:** Accepted
**Date:** 2026-07-24
**Deciders:** Alwurts

## Context

Exploration measured several runtime shapes for an edge-hosted lite factory
(edit → lint → check → publish → serve). That work produced a concrete verdict
and loop numbers; productionization should not re-open that architecture fork
without new evidence.

## Decision

We will ship sfab-lite on this shape:

- Host worker + **AppDO per app** (files / versions / pointer / SQLite via
  ScopedSql).
- **LOADER** child isolates for serve.
- **Plain async TypeScript check worker** (~13s honest); publish gated on
  pass. **CheckDO is rejected** (DO warmth survives ~5s idle but not ~30s;
  full template checks inside a DO never stay warm).
- **Stateless Biome lint worker** (sync on edit).
- Deployables map 1:1 to `apps/{factory,check,lint}` with shared
  `packages/{template,kernel,core}`.

Authoritative summary: [`../architecture/OVERVIEW.md`](../architecture/OVERVIEW.md).
Measured constraints and rejected alternatives:
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).

## Consequences

### Positive

- Architecture is pinned; early work is port/refactor, not redesign.
- Publish gate stays honest (async check), edit path stays fast (sync lint).

### Negative

- Check latency (~13s) is accepted until a parallel research track (TS7,
  lighter check, keep-alive) lands — that track is not a blocker for the
  rest of the loop.

### Mitigations

- Reproduce the edit → lint → check → publish → serve loop once on new
  deploys as the done bar for the kernel + host + check + lint slice.

## Related

- [ADR-0002](./0002-monorepo-tooling-not-product-lite.md)
- [`../engineering/making-it-fit.md`](../engineering/making-it-fit.md)
