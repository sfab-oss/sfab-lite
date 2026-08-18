# 2026-08-15 — Milestone 1 close-out

Non-authoritative (see [`README.md`](README.md)). This note closes the
"lite evolution" milestone that the 2026-08-12 direction note opened.
Per that note's own graduation plan, its durable content moved into
[`../architecture/APP-FORMAT.md`](../architecture/APP-FORMAT.md) and
ADRs [0006](../decisions/0006-base-runtime-is-platform-resolved.md)–[0011](../decisions/0011-eject-rule.md),
and the note itself is deleted. What did **not** graduate is recorded
here so it does not evaporate.

**Status:** Milestone 1 closed **except** the in-app agent design
(item 7 / PR 10), which the owner deferred on 2026-08-15 to work out
directly rather than hand off. Nothing built depends on it.

Addendum 2026-08-17: the post-close-out structure wave through #164
is also closed. Parked drop/keep list and validation honesty:
[`2026-08-17-milestone-1-addendum.md`](2026-08-17-milestone-1-addendum.md).

## What landed (PR map)

| # | Unit | PR | Landed |
| --- | --- | --- | --- |
| 1 | Experiments (memory, eject) → `making-it-fit.md` | #122–#125 | zones rejected; units adopted after prod tail |
| 2 | Restructure to the future-repo map + `check:direction` | #130 | source-only |
| 3 | App format RFC + manifest v0 schema/validation | #131 | `APP-FORMAT.md` |
| 4 | Closed resolve at check, agent-grade diagnostic, `kysely` red test | #132 | |
| 5 | Types pack + agreement gate | #133 | |
| 6 | Check plumbing: snapshot emit, hash store, three units in the worker | #134 | live re-tail 0/8 |
| 7 | Registry: pinned schema, CI gates, hosted `add`, served `/r/`, `@lite` lock, CLI agreement | #136, #137 | |
| 8 | Starter rebuilt on the RFC tree from seven recipes; `check:manifest` drift gate | #138 | checkpoint 4 walkthrough + re-tail 0/8 |
| 8b | First-minute polish from the walkthrough | #140 | |
| 9 | Image v0 on every serve path; generated `package.json`/`tsconfig`/`index.html`/`components.json` + `check:generated`; host readonly + regenerate | #141 | copy-out builds |
| 9b | `select` / `alert` / `empty-state` recipes into the starter (10 recipes) | #142 | |
| 10 | In-app agent design doc | — | **deferred by owner** |

## Exit criteria — met by

The direction note's exit criteria, each with how it is evidenced and
how honestly:

| Criterion | Met by | Evidence level |
| --- | --- | --- |
| Create an app in the new format | Seed = RFC tree; create overlays generated files; image written by CD | **Live** — checkpoint 4 walkthrough (89 s create→ready) and three re-tails |
| `add` a recipe and see provenance recorded | Hosted `add` writes files + `manifest.recipes`; `check:manifest` proves the starter is the catalog | Tests + CI gates; hosted `add` on a live app not exercised in this milestone |
| Hit closed resolve with an actionable failure | Import-map gate + `kysely` red test + diagnostic text | Tests + CI; live check path is the same code |
| Ship an image the host serves | `AppBuild` is image v0; serve reads through it; `X-Sfab-Image` header | Tests + deploy green (#141). First live observation will be the next new create / CD after `3586e3f` — legacy builds serve with `image: null` until then |
| Two experiments answered with numbers | `making-it-fit.md` catalogue | Done (2026-08-13/14 notes) |
| Top level is the future-repo map, direction gate green | `check:direction` in CI since #130 | Done |

Anything more than this is the next milestone arriving early.

## Carried forward (not built, not forgotten)

Re-labelled 2026-08-16 by
[ADR-0013](../decisions/0013-templates-and-registry-are-inert.md): fleet upgrade, unmanaged fraction, per-file modes are
harness concerns; the source-upgrade *mechanism* is not a framework
item.

**Deferred by the owner, to be worked out directly:** the in-app agent
design — tenancy, state location, agent↔app tool transport (in-process
vs RPC — the plan's one explicitly open transport question), memory
posture; each with a `making-it-fit.md` citation. The plan's framing:
a dedicated per-app durable conversation with tools over the app's own
data is the stack's most novel missing primitive, and structure comes
before build. [ADR-0003](../decisions/0003-deferred-domain-tasks-agent.md)'s
"agent substrate — decide when agent work starts" still applies.

**Deferred backlog** (right ideas, wrong milestone — nothing here is
foreclosed): VFS-out-of-bundle via R2 (only if develop must carry more
than ~2 runtime versions) · a node/libsql CI-fixture adapter (when the
image format stabilises) · a fast pre-lint structural validate gate ·
per-file `pinned`/`seeded`/`owned` recipe modes (provenance hashes
already preserve the option) · the component-layer snapshot lever
(sever base-ui from page checks as `api.d.ts` severs the server — binds
only if the prod tail says the client unit is tight) · the better-auth
typed surface (~36 MB more off the server unit) · walkthrough "later"
items: mobile nav that does not hide half the app, ledger dates,
collapsing the double header. Eject-in-CI is **not** on this list by
owner decision (2026-08-15): eject is a bound on lock-in, not a feature.

**Named only** (acknowledged, no design yet): a catalog-module
admission process — must exist *before* the first external-service
need arrives · a fleet-upgrade operation (plan / dry-run / promote /
rollback) · an unmanaged-fraction metric (how much of an app no
mechanism can upgrade) · derived-manifest machinery · facade packages
(runtime APIs cheap-to-check *by construction*, as real published
packages — the long-game version of ADR-0010).

**Named but not built — the source-upgrade problem.** The seed is a
snapshot and registry copies are too; fixes reach *new* apps only. This
is the single biggest unsolved problem for long-lived apps on a
framework whose extension mechanism is copied source. The provenance
record (ADR-0009) is the hook a future migration mechanism stands on;
the mechanism is deferred, deliberately and in writing.

**Open questions still open:** package naming under the new layout
(`@lite/*` is placeholder-bound; settled with branding) · source-of-truth
store (R2 code host today; Git-compatible DO-backed storage is the
expected successor — keep the interface adapter-shaped) · develop-plane
N (how many runtime versions check/pack can carry; from measurement) ·
**cost per app** — the premise is "cheaper than containers" and no
document states a target; measure a real figure (create + N check
cycles + serve, in dollars) once the develop loop is exercised, and set
the target that gates scale-out.

**Standing constraints (unchanged, restated once):** 128 MB per isolate
governs everything; memory claims are verified in production, never
under local workerd; measured-and-rejected ideas stay rejected
(`making-it-fit.md`); the TS 7 lever is tracked, not built, and measured
smaller than advertised (`tsgo` 1.14× leaner RSS on this tree, not
2.9×); apps created before the app format landed are a declared reset
(disposable), not carried by a two-shape compatibility rule.

**Also open, outside the plan:** the CI `check-memory` job fails on the
first attempt of many PR-branch runs with identical numbers (heap after
first app 101.7 → 324.1 MB) and passes on rerun and locally. Owner
2026-08-17: not a project; rerun is the move unless reruns fail too
([addendum](2026-08-17-milestone-1-addendum.md)).

## Non-goals that stay non-goals

An app-level plugin/config system (decided against — ADR-0008) · a lite
CLI wrapper (stock `npx shadcn add @lite/…` is the ejected path) · serve
adapters beyond Cloudflare · an owned pack engine · catalog modules ·
the in-app agent *build*, write-actions, confirmation UX · repo
extraction or renaming · the wider ERP domain beyond parties + ledger ·
Postgres.

## Does not imply

- That the true production OOM rate is zero — every re-tail is n=8;
  the 95 % upper bound is roughly 30 %.
- That the milestone's exit criteria were all observed live — see the
  evidence column above.
- That the direction note's product framing survives; the framework
  stays product-agnostic and the ERP slice was a forcing function.
