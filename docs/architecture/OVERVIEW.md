# Architecture overview — sfab-lite

Settled by measured exploration of edge-native runtime shapes. Do not
relitigate without a new ADR. The numbers that pinned this shape live in
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md) and the
ADRs under [`../decisions/`](../decisions/).

## Hard distinction

1. **Factory is ordinary software.** `factory` (and shared packages it
   uses for UI) may use the full registry / UI stack. It is fixed software
   for the experiment — not a product surface seeking users.
2. **Sub-apps are data.** Hosted lite apps run inside a **frozen kernel**
   (`framework/runtime`): pinned deps, prebuild (types VFS + client chunks).
   The template (`starters/erp`) is the seed + closure source and must
   stay independently runnable.

## Runtime shape

```text
                    ┌─────────────────────────┐
                    │  factory/host           │
                    │  protected /api + UI    │
                    │  AppDataDO + AppCreateDO│
                    └───────────┬─────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼
   LOADER isolates      factory/check (async)     factory/lint (sync)
   (serve)              TS check ~13s honest   Biome on edit
                        publish gated on pass
```

- **Code host** holds each app's Git repo (R2 stand-in now; Cloudflare
  Artifacts later). **CD** writes immutable **builds** keyed by sha; D1
  `live_sha` is the thin pointer serve reads. **AppDataDO** is runtime
  SQLite only — one class, many ids (`${appId}:live`, `${appId}:pr:N`,
  `${workspaceId}:ws`). **AppCreateDO** (`idFromName(appId)`) owns create
  jobs + alarms. There is no forever bare-`appId` live special case.
- **Live** `/a/:appId/*` is public at the host layer (the app's own
  better-auth still applies inside). **PR preview**
  `/a/:appId/preview/:prNumber/*` requires factory session + membership in
  the app's org; preview SQLite is empty+migrations from preview source
  (never a live clone) and is destroyed when the PR leaves `open`.
  **Workspace WIP** `/a/:workspaceId/workspace/*` is the same org-auth
  posture; data is `${workspaceId}:ws` (empty+migrations); the Agent Browser
  Viewer shows `http://localhost/…` chrome while fetching the workspace URL.
  Debounced compile on workspace writes (not full CD per edit).
- **The seed is a snapshot, not a link.** `TEMPLATE_SEED.sourceFiles` becomes
  the initial commit on `main` at create; later work is normal Git. A fix to
  `starters/erp` reaches *new* apps only — existing repos never pick it
  up. Changing behaviour for apps already out there needs a source migration
  or a host-side workaround, and that cost belongs in the design, not the
  rollout.
- **LOADER** child isolates for serve (live, PR preview, or workspace builds).
- **Plain async check worker** — putting the LanguageService in a Durable
  Object was measured and refuted (warmth lasts ~5s idle, not ~30s; full
  template checks never stay warm).
- **Stateless Biome lint worker** — sync on edit.

Shared contracts live in `framework/toolchain`. The verbs (`check`,
`lint`, `build`, format overlay) live in `framework/verbs`; factory
check and lint workers are HTTP shells over them. The host composes
those verbs into CD, PR checks, and workspace compile-on-save — there
is no preview verb ([ADR-0012](../decisions/0012-framework-owns-the-verbs.md)).

## Related primitives (compose these)

Prefer composing these over inventing feature-specific substrate (e.g. a
Design board). **Rule:** no feature-only storage — Viewer / Workspace /
Deployment stay general.

| Primitive | Job | Who uses it |
| --- | --- | --- |
| **Workspace** | Isolated agent computer (checkout + threads + WIP); id = AppAgent name | Agent, MCP, Workspaces tab |
| **Deployment** | Immutable build serve (`live` / PR `preview`) | Serve, Deployments, Viewer |
| **Viewer** | iframe (+ chrome) of `deployment \| workspace` | Agent Browser first; any later surface |
| **Board** | Zoom/pan layout of N Viewers | **Deferred product** — not scheduled |

Cardinality: **N workspaces per app, exactly one default.** Multi-version
compare = multiple **Deployments** (branches/PRs), not N WIP trees. Nested
canvases are a non-goal. Naming:
[`../engineering/terminology.md`](../engineering/terminology.md).

## App format, registry, images (Milestone 1, closed 2026-08-15)

Code enters an app four ways and only four — base runtime, registry
recipes, catalog modules (none yet), agent-written source — with no
`npm install` in the happy path. The contract is
[`APP-FORMAT.md`](APP-FORMAT.md); the decisions behind it are
[ADR-0006](../decisions/0006-base-runtime-is-platform-resolved.md)
(runtime is platform-resolved, pinned by line),
[ADR-0007](../decisions/0007-harness-depends-on-framework-never-the-reverse.md)
(harness → framework, `check:direction`),
[ADR-0008](../decisions/0008-declarative-manifest-no-app-plugin-system.md)
(declarative manifest, generated root files, no plugin API),
[ADR-0009](../decisions/0009-registry-shadcn-format-served-lite-namespace.md)
(shadcn-format registry served at `/r/`, `@lite` only, provenance),
[ADR-0010](../decisions/0010-runtime-type-surface-independent-and-checked-in-units.md)
(runtime-owned type surfaces, snapshot client edge, three check units),
[ADR-0011](../decisions/0011-eject-rule.md) (eject rule),
[ADR-0012](../decisions/0012-framework-owns-the-verbs.md)
(framework owns the verbs; harness composes them).
`AppBuild` is the image: exact runtime + manifest snapshot + asset keys;
serve reads only through it.

## What is in, what is not

| In | Not built yet |
| --- | --- |
| Starter (ERP slice), base runtime, host, check units, lint | Tasks-lite |
| Auth, organizations, app registry | Diffs, quotas, schema evolution |
| App format v0, manifest, generated files, image v0 | Second serve adapter; source-upgrade of existing apps |
| Registry (10 recipes), hosted `add`, `/r/` serving | In-app (per-app) agent — design deferred |
| Factory console + in-console agent loop | Agent over the protected `/api` |
| Isolated org-auth PR previews, workspace WIP serve | Design board |

## Related

- [ADR-0001](../decisions/0001-edge-native-lite-architecture.md) … [ADR-0012](../decisions/0012-framework-owns-the-verbs.md)
- [`APP-FORMAT.md`](APP-FORMAT.md) — app layout, manifest v0, generated members, check units, image
- [`../notes/2026-08-15-milestone-1-closeout.md`](../notes/2026-08-15-milestone-1-closeout.md) — what landed, what carried forward
- [`../engineering/terminology.md`](../engineering/terminology.md)
- [`../engineering/agent-surfaces.md`](../engineering/agent-surfaces.md)
