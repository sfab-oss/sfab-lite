# Architecture overview — sfab-lite

Settled by measured exploration of edge-native runtime shapes. Do not
relitigate without a new ADR. The numbers that pinned this shape live in
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md) and the
ADRs under [`../decisions/`](../decisions/).

## Hard distinction

1. **Factory is ordinary software.** `apps/factory` (and shared packages it
   uses for UI) may use the full registry / UI stack. It is fixed software
   for the experiment — not a product surface seeking users.
2. **Sub-apps are data.** Hosted lite apps run inside a **frozen kernel**
   (`packages/kernel`): pinned deps, prebuild (types VFS + client chunks).
   The template (`packages/template`) is the seed + closure source and must
   stay independently runnable.

## Runtime shape

```text
                    ┌─────────────────────────┐
                    │  apps/factory (host)    │
                    │  protected /api + UI    │
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

- **Code host** holds each app's Git repo (R2 stand-in now; Cloudflare
  Artifacts later). **CD** writes immutable **builds** keyed by sha; D1
  `live_sha` is the thin pointer serve reads. **AppDO** is runtime SQLite
  (+ create jobs) only — not code history.
- **The seed is a snapshot, not a link.** `TEMPLATE_SEED.sourceFiles` becomes
  the initial commit on `main` at create; later work is normal Git. A fix to
  `packages/template` reaches *new* apps only — existing repos never pick it
  up. Changing behaviour for apps already out there needs a source migration
  or a host-side workaround, and that cost belongs in the design, not the
  rollout.
- **LOADER** child isolates for serve (live or PR preview builds).
- **Plain async check worker** — putting the LanguageService in a Durable
  Object was measured and refuted (warmth lasts ~5s idle, not ~30s; full
  template checks never stay warm).
- **Stateless Biome lint worker** — sync on edit.

Shared contracts live in `packages/core`.

## What is in, what is not

| In | Not built yet |
| --- | --- |
| Template, frozen kernel, host, check, lint | Tasks-lite |
| Auth, organizations, app registry | Diffs, quotas, schema evolution, eject |
| Factory console + in-console agent loop | Agent over the protected `/api` |

## Related

- [ADR-0001](../decisions/0001-edge-native-lite-architecture.md)
- [ADR-0002](../decisions/0002-monorepo-tooling-not-product-lite.md)
