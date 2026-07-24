# ADR-0001: Edge-native lite architecture (host + AppDO + check + lint)

**Status:** Accepted
**Date:** 2026-07-24
**Deciders:** Alwurts

## Context

The `explore-edge-native-lite` exploration measured several runtime shapes for
an edge-hosted lite factory (edit → lint → check → publish → serve). T4/T5
produced a concrete verdict and loop numbers; productionization should not
re-open that architecture fork without new evidence.

## Decision

We will ship sfab-lite on the T5 shape:

- Host worker + **AppDO per app** (files / versions / pointer / SQLite via
  ScopedSql).
- **LOADER** child isolates for serve.
- **Plain async TypeScript check worker** (~13s honest); publish gated on
  pass. **CheckDO is rejected** (refuted in T4.2).
- **Stateless Biome lint worker** (sync on edit).
- Deployables map 1:1 to `apps/{factory,check,lint}` with shared
  `packages/{template,kernel,core}`.

Authoritative summary: [`../architecture/OVERVIEW.md`](../architecture/OVERVIEW.md).
Evidence: agent-workspace `archive/explore-edge-native-lite/artifacts/t5/`.

## Consequences

### Positive

- Architecture is pinned; S1–S2 are port/refactor, not redesign.
- Publish gate stays honest (async check), edit path stays fast (sync lint).

### Negative

- Check latency (~13s) is accepted until a parallel research track (TS7,
  lighter check, keep-alive) lands — that track is not a stage blocker.

### Mitigations

- Reproduce the T5 loop once on new deploys as the S2 done bar.

## Related

- Exploration archive `explore-edge-native-lite` (agent-workspace)
- [ADR-0002](./0002-monorepo-tooling-not-product-lite.md)
