# ADR-0002: Monorepo tooling matches starter/platform; "lite" is the product

**Status:** Accepted
**Date:** 2026-07-24
**Deciders:** Alwurts

## Context

S0 initially bootstrapped sfab-lite with a one-off root `tsconfig.base.json`
and a minimal Biome config. That read as "the monorepo itself is lite." The
product intent is different: **lite** is the frozen-kernel template / sub-app
constraint. The factory monorepo should feel like `sfab` / `sfab-starter`.

## Decision

1. Shared config packages: `@sfab-lite/tsconfig`, `@sfab-lite/biome-config`
   (starter idiom).
2. Gates: Turbo + husky + lint-staged + madge + knip; pre-commit is
   platform-closer (workspace, typecheck, cycles, dead-code); pre-push blocks
   `main`.
3. Package names `@sfab-lite/*`; license **AGPL-3.0-only** (same posture as
   the sfab platform).
4. Product "lite" constraints apply to sub-apps / kernel / template — not to
   factory tooling or documentation depth.

## Consequences

### Positive

- Agents and humans reuse starter/platform muscle memory.
- Hygiene gates exist before real code lands.

### Negative

- Heavier install/tool surface than a probe repo.

### Mitigations

- Keep product packages empty until their stage; don't invent lite-specific
  tooling forks.

## Related

- [ADR-0001](./0001-edge-native-lite-architecture.md)
