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
                    │  AppDataDO + AppCreateDO│
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
  `live_sha` is the thin pointer serve reads. **AppDataDO** is runtime
  SQLite only — one class, many ids (`${appId}:live`, `${appId}:pr:N`,
  later `${appId}:ws:…`). **AppCreateDO** (`idFromName(appId)`) owns create
  jobs + alarms. There is no forever bare-`appId` live special case.
- **Live** `/a/:appId/*` is public at the host layer (the app's own
  better-auth still applies inside). **PR preview**
  `/a/:appId/preview/:prNumber/*` requires factory session + membership in
  the app's org; preview SQLite is empty+migrations from preview source
  (never a live clone) and is destroyed when the PR leaves `open`.
  **Workspace WIP** `/a/:appId/workspace/*` is the same org-auth posture;
  data is `${appId}:ws:default` (empty+migrations); the Agent Browser Viewer
  shows `http://localhost/…` chrome while fetching the workspace URL.
  Debounced compile on workspace writes (not full CD per edit).
- **The seed is a snapshot, not a link.** `TEMPLATE_SEED.sourceFiles` becomes
  the initial commit on `main` at create; later work is normal Git. A fix to
  `packages/template` reaches *new* apps only — existing repos never pick it
  up. Changing behaviour for apps already out there needs a source migration
  or a host-side workaround, and that cost belongs in the design, not the
  rollout.
- **LOADER** child isolates for serve (live, PR preview, or workspace builds).
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
| Isolated org-auth PR previews | Design board / multi-workspace |
| Agent Browser workspace WIP serve | |

## Related

- [ADR-0001](../decisions/0001-edge-native-lite-architecture.md)
- [ADR-0002](../decisions/0002-monorepo-tooling-not-product-lite.md)
