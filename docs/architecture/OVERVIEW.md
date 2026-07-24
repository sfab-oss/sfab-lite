# Architecture overview — sfab-lite

Settled by the `explore-edge-native-lite` exploration (T5). Do not relitigate
without a new ADR. Evidence:
agent-workspace `archive/explore-edge-native-lite/artifacts/t5/`.

## Hard distinction

1. **Factory is ordinary software.** `apps/factory` (and shared packages it
   uses for UI) may use the full registry / UI stack. It is fixed software we
   ship and maintain.
2. **Sub-apps are data.** Customer/lite apps run inside a **frozen kernel**
   (`packages/kernel`): pinned deps, prebuild (types VFS + client chunks).
   The template (`packages/template`) is the seed + closure source and must
   stay independently runnable.

## Runtime shape (T5)

```text
                    ┌─────────────────────────┐
                    │  apps/factory (host)    │
                    │  admin API + factory UI │
                    │  AppDO per app          │
                    └───────────┬─────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼
   LOADER isolates      apps/check (async)     apps/lint (sync)
   (serve)              TS check ~13s honest   Biome on edit
                        publish gated on pass
```

- **Host + AppDO** per app: files, versions, pointer, SQLite via ScopedSql.
- **LOADER** child isolates for serve.
- **Plain async check worker** — CheckDO was measured and refuted (T4.2).
- **Stateless Biome lint worker** — sync on edit.

Shared contracts live in `packages/core`.

## Stages (where code lands)

| Stage | Lands |
| --- | --- |
| S1 | `packages/template` port + refactor |
| S2 | kernel + host + check + lint (T5 loop on new deploys) |
| S3 | factory UI + tasks-lite + auth (needs domain decision) |
| S4 | agent over the same admin API |
| S5 | quotas, cookie scoping, schema evolution, eject |

## Related

- [ADR-0001](../decisions/0001-edge-native-lite-architecture.md)
- [ADR-0002](../decisions/0002-monorepo-tooling-not-product-lite.md)
