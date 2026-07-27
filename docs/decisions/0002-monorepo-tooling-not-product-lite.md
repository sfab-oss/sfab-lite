# ADR-0002: Monorepo tooling is full-weight; lite is a kernel constraint

**Status:** Accepted
**Date:** 2026-07-24
**Deciders:** Alwurts

## Context

Initial bootstrap used a one-off root `tsconfig.base.json` and a minimal Biome
config. That read as "the monorepo itself is lite." The intent is different:
**lite** names the frozen-kernel constraint on hosted sub-apps (pinned deps,
no per-app `npm install`). The factory monorepo is ordinary engineering
tooling — shared configs, real gates — not a probe, and not a product being
shipped.

## Decision

1. Shared config packages: `@sfab-lite/tsconfig`, `@sfab-lite/biome-config`
   (starter idiom).
2. Gates: Turbo + husky + lint-staged + madge + knip; pre-commit is
   platform-closer (workspace, typecheck, cycles, dead-code); pre-push blocks
   `main`.
3. Package names `@sfab-lite/*`; license **AGPL-3.0-only**.
4. "Lite" constraints apply to sub-apps / kernel / template — not to factory
   tooling or documentation depth.

## Consequences

### Positive

- Agents and humans reuse familiar monorepo muscle memory.
- Hygiene gates exist before real code lands.

### Negative

- Heavier install/tool surface than a probe repo.

### Mitigations

- Do not invent lite-specific tooling forks; keep factory packages ordinary.

## Related

- [ADR-0001](./0001-edge-native-lite-architecture.md)
