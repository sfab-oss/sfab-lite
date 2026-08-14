# 2026-08-14 — Evidence audit of standing rejections

Non-authoritative (see [`README.md`](README.md)). Catalogue:
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).

**Status:** local done (grades only; no new memory experiments).
**Hypothesis:** recorded rejections and load-bearing claims still deserve
the weight Milestone 1 puts on them. The 2026-08-13 prod matrix showed
recorded numbers age (340-local union was 0/50 on a throwaway worker).
Grade before building.

## How to re-run

Read-only sweep. No measure scripts required except the gzip *re-check*
named below (current artifacts, not a new experiment):

1. `docs/engineering/making-it-fit.md` (limits, rejected table, still-open,
   lessons)
2. `docs/notes/*`
3. `docs/decisions/0001`–`0005`
4. `packages/kernel/kernel.json` totals vs the 10 MB gzip kill
5. Optional current upload: `pnpm node scripts/check-bundle-size.mjs`
   (`wrangler deploy --dry-run` only — not `--remote`, not a live deploy)

## What we ran

Host: `oracle-cool-big-child-1`, 2026-08-14. Repo `main` @ `bc24d20`.
`check-bundle-size.mjs` dry-run (decimal 10,000,000-byte ceiling):

| app | gzip | % of 10 MB |
| --- | --- | ---: |
| `apps/check` | 2.92 MiB | 30.6% |
| `apps/lint` | **9.09 MiB** | **95.4%** |
| `apps/factory` | **dry-run failed** (`#tanstack-router-entry` / `#tanstack-start-entry` / `tanstack-start-manifest:v` unresolved) | — |

`kernel.json` totals (committed, gzip fields are reporting-only):

| field | bytes | vs 10 MiB kill (`killThresholdGzip` 10485760) |
| --- | ---: | --- |
| `totals.gzip` (server + client vendor) | 1,397,297 | 13.3% |
| `typesGzip` | 1,282,999 | 12.2% |
| `clientGzip` | 666,413 | 6.4% |
| `hostBakeGzip` | 2,693,444 | 25.7% |
| `underGzipKill` | true | — |

The lint 9.09 MiB / 95.4% figure in ADR-0004 is **still current**.
Factory 5.48 MiB / 57.5% in ADR-0004 could **not** be re-read this pass.

## Owner brain-dump (2026-08-13) → recorded finding

Owner: pre-repo “DO cache” — Durable Objects evict quickly and lose
state, so they cannot maintain a cache.

**Match: CheckDO warm-affinity rejection.** ADR-0001: “DO warmth survives
~5s idle but not ~30s; full template checks inside a DO never stay warm.”
Catalogue: 5s / 30s / 2m / 5m / 15m ladder, warm at 5s, cold at 30s and
beyond; “CheckDO as rejected.” Same shape: eviction kills a cache.

**Uncovered (untested, not rejected):** using a DO to cache *other* state
than check LanguageService / programs (e.g. a small key-value memo,
create-job progress — AppCreateDO already exists for alarms). The
recorded ladder is about **CheckDO + full template checks**. It does not
by itself refute every DO-held byte. No other pre-repo items were
reported.

## Grades

Evidence class:

- **prod-measured** — `wrangler tail` / websocket outcomes on a real
  Worker (`exceededMemory` vs `ok`), with worker + date
- **local-measured** — `measure-*.mjs` / LanguageService heap, file
  counts, RSS
- **docs-cited** — Cloudflare platform docs or an ADR that cites a
  measurement
- **asserted-without-record** — stated as measured, no raw note / table /
  worker id in this repo

Verdict: **stands** / **re-verify** / **untested**.
Asserted-without-record → **untested**.

M1 = Milestone 1 (“establish the structure”: units, inversion, types
pack). “Leans” means the claim is load-bearing for that work, not merely
historical.

| # | Claim | Grade | Date / worker | M1 leans? | Verdict |
| --- | --- | --- | --- | ---: | --- |
| 1 | Isolate memory **128 MB**, every plan, no knob | docs-cited (Cloudflare); local heap is only an indicator | standing platform | y | stands |
| 2 | Worker upload **10 MB gzip**; CI hard-fail on lint/check | docs-cited + `check-bundle-size.mjs`; lint **re-confirmed 9.09 MiB / 95.4%** 2026-08-14 | 2026-08-14 dry-run | n (upload, not check-cap) | stands (lint still tight) |
| 3 | `kernel.json` host-bake gzip is far under the 10 MiB kill | local-measured (committed artifact) | `bc24d20` | n | stands |
| 4 | Factory upload **5.48 MiB / 57.5%** | docs-cited (ADR-0004); **this dry-run failed** | ADR 2026-07-25 | n | **re-verify** (script/bundling, not necessarily the live worker) |
| 5 | `ctx.waitUntil` killed at **~30s**; 4 attempts hung creates | prod-adjacent: 2026-07-27 live factory (3/8 hung until sweep) + CF budget | live factory 2026-07-27 | y (create path; AppDO alarm is the mitigation) | stands |
| 6 | No isolate affinity (`lsReused: false` every round) | **asserted-without-record** in the catalogue; CF platform also implies it | no raw tail table | y (no in-memory cache) | **untested** as *our* log; platform fact still believed. Re-verify with a live tail of `lsReused` if M1 leans on reuse |
| 7 | DO idle retention **~30s** / CheckDO rejected | docs-cited (ADR-0001 + catalogue). Ladder numbers (5s/30s/2m/5m/15m) have **no `docs/notes` raw table** | ADR 2026-07-24; worker unnamed | y historically (no-cache); units architecture does not need CheckDO | **stands** for CheckDO + check programs. Ladder raw data is weakly evidenced — **re-verify** only if someone re-opens a check-program cache. Other DO caches: **untested** (owner dump) |
| 8 | Share a `DocumentRegistry` ≈ 325 MB, buys time not memory | local-measured (arithmetic + this repo) | 2026-07-25 note | n | stands |
| 9 | Prune never-opened VFS files (upload, not heap) | local-measured `measure-program.mjs` | 2026-07-25 | n | stands |
| 10 | Split today’s program client/server — neither half fits 128 | local-measured `measure-split.mjs`; re-measured 2026-07-27 (client 170 / server 213) | 2026-07-25 / 07-27 | n (superseded by *units*, not by splitting today’s VFS) | stands |
| 11 | Trim `lib.dom.d.ts` — 40% text, ~10% heap | local-measured (phase) | 2026-07-25 | n | stands |
| 12 | Collapse `@radix-ui/react-icons` — 318 files / 4.1 MB, noise | local-measured 2026-07-27 | 2026-07-27 | n | stands |
| 13 | `better-auth` deep import — 157→141 files, **2 MB** heap | local-measured (dep-shape probe) | 2026-07-25 | n for heap; runtime barrel still open | stands |
| 14 | A bigger Worker | docs-cited (CF: 128 MB Free and Paid) | 2026 | y | stands |
| 15 | TypeScript 7 / `tsgo` ~2.9× memory | local-measured: **1.14× RSS** (523 vs 459 MB), pin stays 6.0.3 | 2026-08-13 `tsgo-forecast` | n | stands |
| 16 | ADR-0004 dialect trim: 330.5→263.1 local; prod **4/11 → 0/64** | **prod-measured** on live `sfab-lite-check` (`82db5488` → `4ce2c8af`) | 2026-07-25 | y (technique still sanctioned) | stands as a *then* result. Local heap has since been given back (#17) |
| 17 | ADR-0004 win given back: 1351 files / 336.8 MB (now 1368 / 340) | local-measured `measure-memory.mjs` | 2026-07-27; 2026-08-13 | y (why units, not another trim-only bet) | stands |
| 18 | Live-factory create OOM ~**1 in 4** (2026-07) | **prod-measured**, live factory, n=4 creates (1 stuck) + earlier 36% on 11 check calls | live `sfab-lite-check` 2026-07 | y (the pain M1 heals) | **re-verify** on today’s live worker (Lane B). Aged; throwaway 340-local was 0/50 |
| 19 | Throwaway cheap-union **4/50** OOM; control union **0/50**; units **0/50** | **prod-measured** `sfab-lite-check-exp` (deleted after) | 2026-08-13 | y (decision 8 / units) | stands. **Does not speak for live `sfab-lite-check`** |
| 20 | Evict-on-entry: +1605 MB → +8 MB across six apps | local-measured | ~PR #26 / 2026-07-25 | y (one-app invariant; `runCheck` must stay sync) | stands |
| 21 | `@base-ui/react` whole-package VFS exception | local-measured: 22 loaded when written; **373** (2026-07-27) / **383** (2026-08-13 thin-seed). Two-widget seed restores **22 loaded**, union 339→289 — still over 128 | ADR-0004; `thin-seed` 2026-08-13 | y (client unit UI floor) | **stands** as the exception (client kernel vendors the full surface). Loading 383 is template usage (eight widgets), not a packaging accident. Do not “optimise away” the whole-ship rule; do not treat 289 MB as a cap win |
| 22 | Per-slice check vs today’s VFS, peak 215 MB, not adopted | local-measured; **not tailed** | 2026-08-13 zones | n | stands as a local falsification. Do not treat as prod |
| 23 | Typed cheap drizzle ~100 MB / drizzle+Hono 92–93 MB, catches plants | local-measured; server unit **0/50** on throwaway | 2026-08-13 | y (PR 5 types pack) | stands as indicator + throwaway prod for the *server unit*, not the live worker |
| 24 | Cheap-union 255 MB does not compose into one program | local-measured + throwaway **4/50** | 2026-08-13 | y | stands |
| 25 | Accumulating Hono full-server 146 MB; fragment emit 92 MB | local-measured; throwaway emit **0/50** | 2026-08-13 | y (emit off the ordinary server check) | stands locally; throwaway prod for that program only |
| 26 | Shallow RPC: entities hook 57 MB, page ~147 MB UI floor | local-measured; client-vs-snapshot throwaway **0/50** | 2026-08-13 | y (client unit) | stands as local + throwaway |
| 27 | Eject copy-out is not real (empty `package.json`, no `index.html`) | local-measured unpack of committed seed | 2026-08-13 | y (decision 9 pins) | stands |
| 28 | Entities-only / one-file check does not fit as the cap solution | local-measured | 2026-08-13 | n | stands |
| 29 | Stub-`any` VFS 141→44 MB is not a product | local-measured | 2026-08-13 | n | stands |
| 30 | Two-widget seed is not the cap (289 MB) | local-measured | 2026-08-13 | n | stands |
| 31 | Local workerd memory verification is worthless | docs-cited (miniflare gotchas) + prod 36% after 20/20 local clean; 2026-08-13 ranking inversion | standing | y | stands |
| 32 | Text size / file count do not predict heap | local-measured (`lib.dom`, icon collapse, server vs client) | 2026-07-25 / 07-27 | y | stands |
| 33 | Heap follows the semantic pass, not the file graph | local-measured 2026-07-27 | 2026-07-27 | y | stands |
| 34 | A correct check at one layer can certify a broken product | three instances (seed, memory-growth gate, lint config) | standing lesson | y | stands |
| 35 | `check:check-memory` bounds growth, not absolute floor | local-measured (gate passed through the 74 MB regression) | 2026-07-27 | y (don’t treat it as a cap gate) | stands |

## Weakly evidenced **and** load-bearing for M1

Only these two need a named follow-up. Everything else in the rejected
table either has a measurement note or is not what M1 is built on.

1. **Live-factory OOM rate (row 18).** The architecture exists to heal
   ~1-in-4 create OOM. That rate is **prod-measured but aged**, and the
   throwaway control (row 19) explicitly does not speak for live
   `sfab-lite-check`. **Lane B** is the re-measure. Until it lands, do
   not cite 1-in-4 as the current live rate.
2. **CheckDO ladder raw data (row 7).** The *rejection of CheckDO for
   check-program warmth* is in ADR-0001 and matches the owner dump.
   The 5s/30s/2m/5m/15m table is **not in `docs/notes/`**. M1 units do
   not need that cache; **do not re-open CheckDO**. If a later design
   wants a DO cache of *non-program* state, treat that as **untested**,
   not already rejected.

`lsReused: false` (row 6) is untested *as a repo log*. Cloudflare’s
lack of isolate affinity is still the platform. M1’s no-cache design
does not wait on a new tail of that flag.

**`@base-ui/react` (row 21)** is *not* weakly evidenced. 22 → 373/383
is measured; thin-seed explains it. The exception (ship whole) still
stands. It is load-bearing for the client unit’s UI floor, not a
candidate to silently undo.

**Lint 95.4% (row 2)** is *not* stale. Re-confirmed this pass. Not
check-cap; still a deploy-safety cliff for `apps/lint`.

## What would need re-measuring (named, not done here)

| Item | Why | How |
| --- | --- | --- |
| Live `sfab-lite-check` / factory create OOM | Aged 1-in-4; throwaway ≠ live | Lane B tail (passive, then active if owner says go) |
| Factory gzip % | ADR-0004 57.5%; dry-run now fails | Fix or bypass the TanStack alias dry-run; do not deploy to learn the number |
| CheckDO ladder (only if re-opening DO cache) | Raw ladder missing | New idle ladder on a throwaway DO; not on live check |
| `lsReused` on live check | Catalogue assertion | Count `lsReused` in a live `/check` tail |
| Absolute check-memory ceiling | Growth gate hides floor | Product change, not this audit |

## Does not imply

- That 340 MB local is safe in production because a throwaway was 0/50.
- That CheckDO is refuted for every possible DO-held cache.
- That lint 95.4% is a check-isolate problem.
- Permission to start PR 2 (restructure) from this note.

## Follow-ups

- Lane B: live-factory baseline.
- Lane C: generated drizzle surface (gates PR 5).
- Factory `check-bundle-size` dry-run is broken; file a small docs or
  script fix if the 57.5% figure is still cited as current.
- Optional: graduate the CheckDO ladder into `docs/notes/` *when*
  someone re-runs it — do not invent numbers to fill the gap.
