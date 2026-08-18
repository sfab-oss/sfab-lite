# Making it fit: the constraints of running a factory at the edge

**Living document.** Update it when a technique is proven or refuted — that is
the point of it. Numbers here are measured, and each one says where it came
from.

sfab-lite's premise is that a whole app factory — typecheck, lint, build,
serve — runs on Cloudflare Workers directly, with no build container anywhere.
That premise is only interesting if it survives contact with the platform's
limits, and most of the hard engineering in this repo has been exactly that
fight.

Whether it fits is the third question alongside cheaper and faster, not a
prerequisite to them. The cost and speed both come out of the shrinking, so
what the shrinking cost is part of the same result.

This is the catalogue: what the limits are, what worked, what was measured and
rejected, and what is still open. Read it before proposing a fix for a
"performance" or "flakiness" problem here — several attractive ideas are
already refuted with numbers, and re-deriving them is expensive.

## The limits we actually run into

| Limit | Value | Where it bites |
| --- | --- | --- |
| Isolate memory | **128 MB**, every plan, no knob | The TypeScript check worker |
| Worker upload | **10 MB gzip** | Every worker in the app loop — host, check, lint, build — CI hard-fail at ≥97%. |
| `ctx.waitUntil` | killed at **~30s** | Async app-create attempts |
| Isolate affinity | **none** | Any warm in-memory cache |
| DO idle retention | **~30s** | Any DO-based warm cache |
| Filesystem | none | Seed and types must be bundle constants |
| Package resolution in Biome WASM | none | Lint config cannot `extends` |

Two of these are worth internalising because they defeat the obvious approach:

**There is no isolate affinity.** Successive requests do not reach the same
isolate, so an in-memory incremental cache never survives between them. This is
what makes "just keep the LanguageService warm" a non-strategy in a plain
Worker. Measured: `lsReused: false` on every round.

**Durable Objects do not fix that, and do not give you more memory.** A DO gets
the same 128 MB. It gives affinity, but it is evicted after roughly 30 seconds
idle — measured across a 5s / 30s / 2m / 5m / 15m ladder: warm at 5s, cold at
30s and everything beyond. An editing session has longer gaps than that. This
is why ADR-0001 records **CheckDO as rejected**.

## Techniques that worked

### 1. Bundle constants instead of a filesystem

Workers have no filesystem, so the template seed
(`starters/erp/generated/seed.json`) and the entire TypeScript types
universe (`framework/runtime/src/generated/types-vfs.js`) are baked into the
bundle at build time.

The trap this creates is real and we hit it: editing the template without
re-baking leaves **every gate green** while the factory keeps seeding the old
source. `check:seed` and `check:kernel` exist because of that, and both work by
regenerating and diffing against the committed artifact.

### 2. Closure pruning, not whole-package dumps

The types VFS ships only the `.d.ts` closure the template's own TypeScript
program reaches, resolved against an isolated install
(`framework/runtime/universe`) so workspace peers cannot leak in. Whole-package
dumps would be several times larger.

One deliberate exception: `@base-ui/react` ships whole, because the client
kernel vendors the full runtime surface and the VFS must advertise the same
vocabulary — otherwise an app importing `dialog` fails the check for a
component that would have worked. The exception is load bearing; do not
"optimise" it away.

It was 800 files in the VFS with **22 loaded**. As of 2026-07-27 it is 1151 in
the VFS with **373 loaded** — see the regression below. Shipping whole is still
right; loading 373 of them is what needs explaining.

### 3. Bounding per-app state to exactly one app

The check worker kept a LanguageService per `appId` in a map that never
evicted. One program retains far more than an isolate holds, so the *second*
distinct app checked in a warm isolate built its program while the first was
still resident, and the isolate died.

Evicting on entry took heap growth across six apps from **+1,605 MB to +8 MB**.

A check run is now three ordered units (server → emit → client). The
LanguageService is disposed between them, so the store-bound gate is "at most
one app in the store, and **zero** live programs after a run returns." The
sync invariant is unchanged: an `await` between construct and dispose would
let two programs coexist.

This works only because `runCheck` is **synchronous**. JavaScript is
single-threaded and a synchronous function cannot yield, so two requests in one
isolate cannot interleave and the earlier program is always unreferenced before
the next is built. **Making `runCheck` async would let two programs coexist and
put the isolate straight back over the limit, with this cap still looking
correct.** Treat that as a real invariant, not a comment.

### 4. Trimming unreachable capability out of vendored surface

The largest single win, and now a sanctioned technique —
**[ADR-0004](../decisions/0004-trim-unreachable-vendor-surface.md)**.

Sub-apps run on D1. Drizzle nevertheless dragged its Postgres, MySQL, Gel and
SingleStore dialects into every check — 232 of 877 source files — because
`column-builder.d.ts` names a column class per dialect inside conditional-type
branches that a SQLite app never takes. TypeScript still resolves the types
inside branches it will not take.

| | before | after |
| --- | --- | --- |
| source files loaded | 877 | 645 |
| retained heap | 330.5 MB | 263.1 MB |
| production `exceededMemory` | 4 of 11 calls (36%) | **0 of 64** |

The general shape: **the frozen kernel defines what a sub-app can do, so
surface for capability the kernel does not serve is dead by construction.** See
the ADR for the three conditions that make a trim legitimate and for the next
candidates.

### 5. Retrying isolate death, but only within the budget

`callCheck` retries a *thrown* service-binding call. An `exceededMemory` kill
throws; a real check result returns a status. So this retries isolate deaths
and never retries a genuine failure.

The budget is **wall clock, not arithmetic**. Four attempts was tried and made
things strictly worse: `runCommitAttempt` runs under `ctx.waitUntil`, which is
killed at ~30s, and a killed attempt writes no terminal status — so three of
eight creates **hung for five minutes** until the stale sweep reclaimed them,
instead of failing in fifteen seconds. `CHECK_ATTEMPTS` is 2.

### 6. Giving the retry a place to stand

`CHECK_ATTEMPTS` is capped at 2 by a budget, not by what the failure deserves.
Creates now run from an **AppDO alarm** instead of `ctx.waitUntil`, which is
what buys a real one (2026-07-27).

The mechanism is the ordering, not the alarm: the alarm is re-armed *before*
the run starts and cleared when it finishes, so an invocation killed mid-flight
leaves it armed and the runtime fires again. Deliberately not "throw and let
the runtime retry" — the failure being recovered from is a kill, and a killed
handler throws nothing.

Only **create** qualifies. Its whole input is the template seed, a bundle
constant, so a retry needs two ids and nothing else. An ordinary commit carries
the agent's workspace and has no such property; it still runs under
`waitUntil`.

The same change let the registry sweep stop being time-based. It always asked
the AppDO for the truth — it just waited out `STALE_ATTEMPT_MS` first. A
*terminal* attempt is finished whatever the clock says, so a `creating` row
behind one settles on the next poll. That closes the gap where the console
(120s) gave up three minutes before reconciliation (300s) ran.

### 7. Fan-out R2 git-object I/O; do not mkdir ancestors of a PUT

R2 is a flat keyspace. `lstat` already answers "directory" via children, so a
file PUT implies its parent prefixes — walking ancestors to write `.gitkeep`
on every blob was pure round-trips. Measured 2026-08-16 on Canary (n=3 live
creates after #145): create→ready **104–107 s**, CD self-timed **21–24 s**,
the internal run-create request **106.7 s** wall — about **84 s** of each
create (and of every later push) was sequential `copyTree` of ~100 seed
objects, each `writeFileBytes` doing exists/head/list + a marker PUT per
ancestor (~5–8 R2 ops per blob). Fixed by one PUT per file and a bounded
parallel copy (16), plus one flat prefix `list` when the source is R2 (#146).
Re-measured 2026-08-16 after deploy, same protocol (n=3): create→ready
**38–40 s** (was 104–107), run-create request **41.3–42.8 s** wall (was
106.7–111.0). Create-run stages: ensureRepo **~5.0–5.3 s**, commitTree
**3.9–4.0 s**, CD **21–24 s**, settle 0.1 s. Inside CD the check isolate is
still **14–16 s** (tail); build 3.6–4.5 s.

Two things the numbers say about themselves. In-isolate `checkMs`/`lintMs`
read **0** in production (the check worker's own `wallMs` too): Workers
freeze `Date.now()` during CPU work and around the service-binding wait, so
`schemaMs` (14.6–18 s) is mostly the clock catching up on the check — check
duration is only observable from the tail's `wallTime`. And the remaining
seconds are now the check unit itself (cold LanguageService on every create,
`forceColdCheck`), ensureRepo, and the ≤5 s create poll — not the code host.

### 8. Load drizzle-kit generate as extra ESM in the schema-probe Loader child

A naive esbuild/vite bundle of `drizzle-kit/api` does not boot on workerd
(eager dialect init; `createRequire(import.meta.url)` with `url` undefined).
The 2026-08-16 probe ran a patched `api.mjs` as its own ES module under
`nodejs_compat` (~0.44–0.64 MiB gzip; import-closure ~0.56 MiB gzip). The
host fetches that map from `KERNEL_R2`
(`tools/drizzle-kit/<kit>-<orm>/`) on first use per isolate and passes
the sources into the existing schema-probe Worker Loader child so Vite
never flattens or executes `api.mjs`. Shipping the map inside the host
script pushed `factory/host` to 9.84 MiB gzip (103% of the 10 MB Worker
limit). Not the check worker — that isolate is the 128 MB budget. See
[ADR-0014](../decisions/0014-adapter-contract-db-storage-code-host.md).

### 9. One aux worker per framework verb (host is a composer)

Wasm cannot be fetched from R2 and compiled at runtime in Workers, so
the kernel / drizzle-kit R2 trick does not apply to `esbuild-wasm`.
Measured 2026-08-16 on main (`76bae79`): host upload **9.28 MiB gzip =
97.3%** of the 10 MB ceiling. Composition: `esbuild-wasm` **3.68 MiB
(38%)** via `@cloudflare/worker-bundler` through the in-host build
verb; server entry 3.50 MiB (36%); ~390 lazy chunks 2.45 MiB (25%,
mostly shiki — parked). After moving build to `factory/build`
(2026-08-16, this PR): host **5.47 MiB gzip (57.3%)**, build **4.46 MiB
gzip (46.7%)**, check 2.90 / lint 9.09 (unchanged). `check:bundle-size`
hard-fails all four workers at ≥97%. See
[ADR-0015](../decisions/0015-one-worker-per-verb.md).

### 10. Console code viewers are client-only; the Worker never sees shiki

The remaining 2.45 MiB of lazy chunks were `@pierre/diffs` (the PR diff
and workspace file viewers) importing shiki's full `bundledLanguages` —
~200 grammars plus the oniguruma wasm — and TanStack Start SSR emitted
every one of them into the Worker upload, where Cloudflare counts lazy
modules too. The server never highlights anything: these are
interactive widgets. `factory/host/src/components/code/pierre-client.tsx`
wraps both in `ClientOnly` + `lazy`, and a Vite plugin
(`pierreClientOnly` in `vite.config.ts`) resolves `@pierre/diffs/react`
to an empty stub in the `ssr` environment. Measured 2026-08-17: host
**5.47 → 3.70 MiB gzip (38.8%)**, server modules 391 → 78; client bundle
unchanged (it already loaded those chunks lazily). Harness-only —
nothing under `framework/` imports pierre.

## Measured and rejected — do not re-derive these

| Idea | Why it fails | Evidence |
| --- | --- | --- |
| Share a `DocumentRegistry` across apps | Shared ASTs become permanently resident; peak = shared parse (195 MB) + per-app check (130 MB) ≈ 325 MB. Identical. Buys time, not memory. | arithmetic, this repo |
| Prune the VFS of never-opened files | 1,196 files are never opened — they cost upload, not heap | `measure-program.mjs` |
| Split the program into client + server | Client-only still loads 876 of 877 files: `api.ts` does `hc<AppType>` against the server's Hono type, and that one `import type` fuses the graphs. Cutting it still leaves the server half at 703 files / 270 MB (~82%). **Re-measured 2026-07-27: the real objection is simpler — client 170 MB, server 213 MB, so neither half fits 128 MB.** | `measure-split.mjs` |
| Trim `lib.dom.d.ts` | 40% of loaded text but only **32 MB / ~10%** of heap | phase measurement |
| Collapse `@radix-ui/react-icons` to one `.d.ts` | The kernel serves the barrel and refuses deep imports, so one icon opens all 320 per-icon files. Collapsing the barrel to inline declarations took the program from **1351 to 1033** source files and the heap from **336.8 to 332.7 MB** — 318 files for 4.1 MB, at or below run-to-run noise. Each file is four lines declaring one `ForwardRefExoticComponent`; nothing like drizzle's dialect modules. | `measure-program.mjs`, `measure-memory.mjs`, 2026-07-27 |
| `better-auth` deep imports | 157 → 141 files, 2 MB of heap; also blocked by the import-map resolver gate | dep-shape probe |
| CheckDO for warm affinity | Retention ~30s; full template checks did not stay warm and often 500'd | DO warm-curve ladder |
| A bigger Worker | 128 MB on Free and Paid alike; no 2026 increase | Cloudflare docs |
| TypeScript 7 / `tsgo` (~2.9x less memory) | Pin stays 6.0.3. Local disk `tsc` vs `tsgo` 7.0.0-dev.20260707.2 on the materialized VFS+seed: **1.14× RSS** (523 vs 459 MB), ~2.5× user time. The ~2.9× figure is not this program or this metric. | [`../notes/2026-08-13-tsgo-forecast.md`](../notes/2026-08-13-tsgo-forecast.md) |
| Tailwind oxide `Scanner` in the build worker (replace `extractCandidates`) | The only non-native build is `@tailwindcss/oxide-wasm32-wasi` (1.72 MB wasm, 0.55 MB gzip) and its loader needs `node:worker_threads` + `readFileSync` for wasi-threads; Workers `nodejs_compat` has neither and wasm must be a static import. `tailwindcss` `compile()` itself does no scanning. The 137-line JS extractor in `framework/verbs/src/build/css-extract.ts` stays, with its documented misses. | package inspection 2026-08-17, hand-rolled audit |

## Still open

- **The ADR-0004 win has been given back.** Measured 2026-07-27 with
  `measure-memory.mjs`, the same script that produced the numbers above:

  | | files loaded | retained heap |
  | --- | --- | --- |
  | before ADR-0004 | 877 | 330.5 MB |
  | after ADR-0004 | 645 | 263.1 MB |
  | **2026-07-27** | **1351** | **336.8 MB** |
  | **2026-08-13** | **1368** | **340 MB** |

  Retention is now *above* the pre-trim figure. Against the live factory
  (2026-07) one create in four failed; technique 6 above stops that
  costing the app — an OOM is now a retry — but it is a mitigation and
  this is still a local-heap regression. **Re-tailed 2026-08-14 on live
  `sfab-lite-check`:** eight sequential creates, **8/8 ready**, **8/8
  check `ok`**, **0 `exceededMemory`**, no retries
  ([`../notes/2026-08-14-live-factory-baseline.md`](../notes/2026-08-14-live-factory-baseline.md)).
  Do not cite 1-in-4 as the current live rate. Re-measured 2026-08-13 with
  `measure-memory.mjs` (APPS=1): 72 app source files, **339.5 MB** over
  the 88.7 MB VFS baseline — same ballpark as the 2026-07-27 figure; the
  template has grown, not shrunk.

  Production recalibration 2026-08-13 on throwaway `sfab-lite-check-exp`
  (not the live check worker): the same 340 MB union was **0/50**
  `exceededMemory`. The cheap-surface 255 MB union was **4/50**. Local
  heap ranking is not production ranking. Details:
  [`../notes/2026-08-13-prod-tail-matrix.md`](../notes/2026-08-13-prod-tail-matrix.md).

  `check:check-memory` passes throughout, because it bounds *growth between
  apps* (+9.1 MB against a 50 MB limit) and never looks at the absolute floor.
  It is the third instance of the pattern in the last lesson below, and it
  wants an absolute ceiling.

  The icon collapse in the rejected table above was the first hypothesis and
  accounted for 4 MB of it. `@base-ui/react` at 383 loaded vs the 22 recorded
  when the exception was written is real — a two-widget seed restores **22
  loaded** and only drops union heap 339 → 289 MB
  ([`../notes/2026-08-13-thin-seed.md`](../notes/2026-08-13-thin-seed.md)).
  That is not the cap.

- **Recipes grow checked surface.** First recipes (PR 7) are extracts of
  starter UI retargeted at the RFC tree. Local starter vs
  starter-plus-all-recipes: server **244.6 → 263.0 MB** (+7 roots),
  client **371.5 → 371.8 MB** (unchanged graph — recipes were unused
  RFC-path copies), 0 diagnostics. Full trail:
  [`../notes/2026-08-14-assembled-recipes-check.md`](../notes/2026-08-14-assembled-recipes-check.md).
  **PR 8 rebuilt the starter from those recipes** and dropped the unused
  sidebar/widget tree. Product-path `measure:units` 2026-08-14: server
  **243.2 MB** (83 roots), client **318.6 MB** (90 roots), emit **248.4 MB**.
  Re-adding the catalog onto the rebuilt seed is a no-op (already assembled):
  server 243.4 / 245.5 MB, client 318.7 / 319.0 MB.
  [`../notes/2026-08-14-pr8-starter-rebuild-check.md`](../notes/2026-08-14-pr8-starter-rebuild-check.md).
  Production ceiling after the rebuild: still **0/8** OOM (checkpoint 4
  re-tail, 8/8 ready, 0 retries; wall 12.7–13.9 s, one 20.9 s).
  [`../notes/2026-08-15-cp4-retail.md`](../notes/2026-08-15-cp4-retail.md).
  **2026-08-18 full catalog (53 recipes) onto the ten-recipe seed:**
  server stays 84 roots / 255 → 258 MB; client **94 → 137 roots**,
  **340 → 431 MB**. Extra files are unused `src/components/ui/` (client
  unit). The unused remainder stays `apps_add`.
  [`../notes/2026-08-18-full-catalog-assembled-check.md`](../notes/2026-08-18-full-catalog-assembled-check.md).
  **Imported-shell seed (22 recipes the layout imports):** server 84 /
  251 MB; client **114 roots / 386 MB**. Not the unused catalog.
  [`../notes/2026-08-18-imported-shell-units.md`](../notes/2026-08-18-imported-shell-units.md).

- **Runtime bundle diet.** Full write-up:
  [`../notes/2026-08-13-serve-upload-diet.md`](../notes/2026-08-13-serve-upload-diet.md).
  `factory/lint` is at 95.4% of the upload limit (Biome WASM). `factory` at
  57.5% carries the vendor bundles. `better-auth.js` is 2.2 MB raw / 346 KB
  gzip because **`betterAuth` core** is that large — the vendor entry already
  re-exports only `betterAuth` + drizzle adapter + organization, and swapping
  `better-auth/plugins` for `better-auth/plugins/organization` saved **0 bytes**.
  `esbuild --minify` on committed **client** chunks saves **197 KB gzip**
  (662 → 460), mostly `base-ui-react` and `react-dom-client`. Minifying
  `better-auth.js` saves ~102 KB gzip. **Not check-cap.** zod-compiler 1.26.2
  exists; do not put it on the import map.
- **Client kernel is unminified** — `browserShared` has no `minify: true`.
  The 197 KB figure above is the probe; landing minify is a prebuild PR.
- **Check wall-time backlog** (affected-file diagnostics, factory tree-hash
  skip for agent-only typecheck, `/check` `forceCold` default) — ranked in
  [`../notes/2026-07-29-check-optimization-backlog.md`](../notes/2026-07-29-check-optimization-backlog.md).
  Do not re-open CheckDO / affinity as the answer.

- **Per-slice checking against today's VFS does not fit locally.** Full
  write-up:
  [`../notes/2026-08-13-zone-check-memory.md`](../notes/2026-08-13-zone-check-memory.md).
  Measured 2026-08-13 with `factory/check/scripts/measure-zones.ts` (same overlay-all /
  seed-roots harness as `measure-split.mjs`):

  | program | files loaded | retained heap |
  | --- | --- | --- |
  | union (today) | 1368 | 340 MB |
  | data-only (`src/db/`) | 140 | **77 MB** |
  | shared-only (`src/contract/`) | 145 | **53 MB** |
  | server, client edge cut | 487 | **215 MB** |
  | client vs generated API `.d.ts` | 1250 | **145 MB** |
  | *peak of the four slices* | — | **215 MB** |

  Data and shared sit under 128 MB *as a local indicator*. Server (215) and
  client-with-generated-dts (145) do not. Peak is 63% of the union, still
  above the cap, and the server number is the 2026-07-27 server-only 213 MB
  re-derived — slicing the program does not shrink the expensive half.
  Generated `api.d.ts` (`typeof ApiType` via `typeToString`, 12.5 KB, no
  drizzle mention) matches the old `hc<any>` stub (~144 MB): it severs the
  client→server inference and does not save the client from React / base-ui.
  **Not adopted.** Local numbers never close a memory claim here; the
  215 MB real-VFS server *zone* was not tailed. The later typed server
  *unit* (93 local) was **0/50** on a throwaway worker
  ([`../notes/2026-08-13-prod-tail-matrix.md`](../notes/2026-08-13-prod-tail-matrix.md))
  — a different program. Do not treat slice-checking, or
  per-capability-set vendoring, as the cap solution. The separate
  requirement that the runtime's type surface not be *derived from the
  template* still stands; this experiment only falsifies "split today's
  program into zones and the cap is fine."

- **Eject copy-out was not real on 2026-08-13; it builds since 2026-08-15.** Full write-up:
  [`../notes/2026-08-13-eject-copy-out.md`](../notes/2026-08-13-eject-copy-out.md).
  Unpacked the committed seed
  (`starters/erp/generated/seed.json`, 81 files — what a live app
  actually is) into a fresh tree and ran `pnpm install && vite build`.
  `pnpm install` is a no-op: the seeded `package.json` has **no
  dependencies**. `vite build` then fails resolving `@tailwindcss/vite`,
  `@vitejs/plugin-react`, and `vite` itself from `vite.config.ts`. The seed
  also has **no `index.html`**. Recorded so the app-format RFC cannot claim
  eject. Generated `package.json` / `tsconfig` with real pins (decision 9)
  are load-bearing, not polish; price their absence as an eject regression
  if they do not ship with the format. **Re-run 2026-08-15** after the
  generated files landed (#141): `pnpm install` + `vite build` pass on the
  copied tree ([`../notes/2026-08-15-pr9-image-generated.md`](../notes/2026-08-15-pr9-image-generated.md)).
  Eject is a bound on lock-in, not a feature ([ADR-0011](../decisions/0011-eject-rule.md)).

- **Entities-only / one-file check does not fit as a cap solution.** Full
  write-up:
  [`../notes/2026-08-13-entities-only-check.md`](../notes/2026-08-13-entities-only-check.md).
  Import-closure heap: contract 52 MB, server `entities.ts` **135 MB**, hook
  222 MB, client page **281 MB** (almost the 339 MB union). Affected-file
  (full program, semantic pass on one file) is 165–189 MB — faster (1.4–2.2 s
  vs 6.2 s), still over. Granularity helps server/contract edits; a route
  that imports AppShell + widgets does not shrink. **Not adopted** as the
  cap strategy; still a road for seeding the program from the edited file,
  not for keeping today's 72 roots.

- **Stub VFS on server entities fits locally and is not a product.** Full
  write-up:
  [`../notes/2026-08-13-stub-vfs-server-entities.md`](../notes/2026-08-13-stub-vfs-server-entities.md).
  Overlaying tiny `any` `.d.ts` stubs on vendor packages, same
  server-entities import-closure roots: 141 → 100 (drizzle) → 85 (hono) →
  76 (zod) → **44 MB** (better-auth family). All `/node_modules` stubs floor
  at 41 MB. **Do not ship `any` overlays.** Follow-up (typed, not `any`):
  [`../notes/2026-08-13-typed-cheap-stubs.md`](../notes/2026-08-13-typed-cheap-stubs.md)
  — typed drizzle stays **100 MB** (same as `any`); typed drizzle + Hono
  **92 MB**, 0 diags, and catches planted `number`/`string` errors that
  `any` misses. Specialized check surface is a real road; handwritten
  overlays are still not the product.

- **Two-widget seed is not the cap.** Full write-up:
  [`../notes/2026-08-13-thin-seed.md`](../notes/2026-08-13-thin-seed.md).
  Keeping button + input and stubbing the other Base UI wrappers: union
  339 → **289 MB**, entities page 282 → **253 MB**. `@base-ui` files loaded
  383 → **22** (the original exception size). Tens of megabytes, still far
  over 128.

- **Shallow RPC severs the client→server graph; UI types are the floor.**
  Full write-up:
  [`../notes/2026-08-13-shallow-rpc.md`](../notes/2026-08-13-shallow-rpc.md).
  Handwritten fetch map + `src/contract/` instead of `hc<ApiType>`:
  entities hook 222 → **57 MB** (fits locally), page 283 → **148 MB**,
  client entry 170 → **139 MB** (same family as generated `api.d.ts` ~
  145 MB). Union barely moves (339 → 327) because server files stay roots.
  Independence already required this cut.

- **Stacking typed stubs + shallow RPC does not fit the union.** Full
  write-up:
  [`../notes/2026-08-13-stack-typed-shallow.md`](../notes/2026-08-13-stack-typed-shallow.md).
  Union 340 → **255 MB** stacked (same as typed-only 254); entities page
  **147 MB** (UI floor, same as shallow-only 149). 92 and 148 do not
  compose into one program. Two check units, not today's 71 roots.

- **Cheap accumulating Hono emits a snapshot; the full-server
  accumulating check does not fit locally.** Full write-up:
  [`../notes/2026-08-13-snapshot-accumulating-hono.md`](../notes/2026-08-13-snapshot-accumulating-hono.md).
  Server entry, typed drizzle+Hono, no accum: **93 MB**. Same tree
  accumulating routes + emit: **146 MB** (12 paths / 18 methods,
  standalone `api.d.ts` 6.2 KB, no `AppEnv` / drizzle). Client vs that
  snapshot is green except the seed `styles.css` import. Planted
  handler bugs and a GET `data` → `items` freshness break both land.
  One–five methods stay at 92–93 MB; the jump is the accumulated
  schema, not files. Do not accumulate on the ordinary server check.
  Per-module fragment emit stays at **92 MB**:
  [`../notes/2026-08-13-snapshot-route-fragments.md`](../notes/2026-08-13-snapshot-route-fragments.md).

- **Prod tail matrix: units, not a single cheap-surface program.** Full
  write-up:
  [`../notes/2026-08-13-prod-tail-matrix.md`](../notes/2026-08-13-prod-tail-matrix.md).
  Throwaway `sfab-lite-check-exp`, 50 spaced invocations each, count
  `exceededMemory`. Cheap-union **4/50**; control union **0/50**; server
  unit **0/50**; accumulating emit **0/50**; client-vs-snapshot **0/50**.
  255 local does not fit production. 340 local no longer maps to the
  historical ~1-in-4 on this worker (live-factory 1-in-4 is a different
  worker and date).

- **`tsgo` forecast: faster here, not 2.9× RSS.** Full write-up:
  [`../notes/2026-08-13-tsgo-forecast.md`](../notes/2026-08-13-tsgo-forecast.md).
  See the rejected-table row. Pin stays 6.0.3.

- **Generated cheap drizzle works with curated seams.** Full write-up:
  [`../notes/2026-08-14-generator-spike.md`](../notes/2026-08-14-generator-spike.md).
  **Shipped in the types pack (PR 5):** live `TYPES_VFS` overlays drizzle
  declaration files with the generated sqlite/D1 surface. Agreement
  0=0 on starter drizzle server files, plants caught; entities
  generated **102 MB** vs real **141**. Union `measure-memory` APPS=1
  same-session vs parent `9d51e65`: overBaseline **305.5 MB** (parent
  **339.6 MB**); total heap 394.4 vs 431.9. Local indicator; prod
  re-tail stays post-PR6.

- **Check units shipped (PR 6).** `runCheck` is three ordered sync units
  (server → emit → client) with the LanguageService disposed between them.
  Snapshot I/O is in-memory; the host persists `src/generated/api.d.ts` +
  `api.hash`. Stale hash is a hard fail (`LITE-SNAPSHOT`, code 9001). Client
  edge cut is the starter importing that snapshot, not `typeof` the live
  server. `measure:units` 2026-08-14 (Node, heap sampled while the unit's
  LanguageService is live; product-path column is the rebuilt starter
  after PR 8 — PR 6 measured 244 / 250 / 372 MB on the old tree):

  | unit | experiment (isolated) | product path |
  | --- | --- | --- |
  | server | 93 MB | **243 MB** (83 roots: all non-client `src/`) |
  | emit, cold full-tree | 146 MB | **248 MB** |
  | emit, warm leaf | 92 MB | not heap-sampled; 0.8 s vs cold 1.7 s |
  | client vs snapshot | 147–175 MB | **319 MB** |

  After dispose, retained ~98 MB; `check:check-memory` is flat across six
  apps (−0.5 MB, store size 1, zero live services). The product server unit
  is not the experiment's entry-closure program. Local peaks do not close a
  memory claim; checkpoint 3 is the live re-tail vs the 0/8 baseline
  ([`../notes/2026-08-14-live-factory-baseline.md`](../notes/2026-08-14-live-factory-baseline.md)).

## Three lessons that keep recurring

**Local verification of a platform limit is worthless.** Local workerd applies
**no memory limit** — `.agents/skills/cloudflare/references/miniflare/gotchas.md`
says so explicitly. A "20/20 clean under `wrangler dev`" result said nothing at
all about a 36% production OOM rate. Anything memory-shaped must be measured
with `wrangler tail --format json` against a real deploy, counting outcomes.

**Text size does not predict heap, and neither does file count.**
`lib.dom.d.ts` is 40% of loaded text and ~10% of heap; generic-heavy library
types cost far more per byte than declaration-heavy ones. Measure heap when the
target is the check worker; measure bytes when the target is the upload limit.
They are different problems with different answers.

**Heap follows the semantic pass, not the file graph.** Measured 2026-07-27:
client-only loads 1350 of 1351 files and retains 170 MB, while server-only
loads 474 and retains 213 MB — a third of the files, more heap. What costs is
checking the roots, not resolving files into the program. Removing 318 icon
files changed nothing because nothing was checking them. Before proposing a
trim, ask whether it removes work the checker is doing, not files it is
holding.

**A correct check at one layer can certify a broken product.** This has now
bitten repeatedly, in the same shape each time: the seed gate passes while the
factory seeds stale source; the memory gate passes while two programs coexist;
the lint gate passes against a config the worker does not use. When adding a
gate, ask what it would still pass if the thing it protects were completely
broken — and red-test it by deliberately breaking that thing before trusting
it.

## Related

- [ADR-0001](../decisions/0001-edge-native-lite-architecture.md) — the
  architecture these constraints shaped
- [ADR-0004](../decisions/0004-trim-unreachable-vendor-surface.md) — trimming
  unreachable vendor surface
- [`../notes/2026-07-25-check-worker-memory.md`](../notes/2026-07-25-check-worker-memory.md)
  — the full memory investigation
- [`../notes/2026-07-27-check-worker-memory-regression.md`](../notes/2026-07-27-check-worker-memory-regression.md)
  — ADR-0004 win given back
- [`../notes/2026-08-13-zone-check-memory.md`](../notes/2026-08-13-zone-check-memory.md)
  — zone-check against today's VFS (item 8a)
- [`../notes/2026-08-13-eject-copy-out.md`](../notes/2026-08-13-eject-copy-out.md)
  — eject copy-out of the seed (item 8b)
- [`../notes/2026-08-13-entities-only-check.md`](../notes/2026-08-13-entities-only-check.md)
  — entities-only / one-file check
- [`../notes/2026-08-13-stub-vfs-server-entities.md`](../notes/2026-08-13-stub-vfs-server-entities.md)
  — stub VFS on server entities
- [`../notes/2026-08-13-typed-cheap-stubs.md`](../notes/2026-08-13-typed-cheap-stubs.md)
  — typed cheap vendor stubs (not `any`)
- [`../notes/2026-08-13-thin-seed.md`](../notes/2026-08-13-thin-seed.md)
  — two-widget / thinner seed
- [`../notes/2026-08-13-tsgo-forecast.md`](../notes/2026-08-13-tsgo-forecast.md)
  — tsgo / TS 7 forecast
- [`../notes/2026-08-13-shallow-rpc.md`](../notes/2026-08-13-shallow-rpc.md)
  — shallow RPC (contracts, not `typeof api`)
- [`../notes/2026-08-13-stack-typed-shallow.md`](../notes/2026-08-13-stack-typed-shallow.md)
  — stacked typed stubs + shallow RPC
- [`../notes/2026-08-13-snapshot-accumulating-hono.md`](../notes/2026-08-13-snapshot-accumulating-hono.md)
  — cheap accumulating Hono + snapshot emit
- [`../notes/2026-08-13-snapshot-route-fragments.md`](../notes/2026-08-13-snapshot-route-fragments.md)
  — per-module snapshot fragments
- [`../notes/2026-08-13-serve-upload-diet.md`](../notes/2026-08-13-serve-upload-diet.md)
  — serve / upload diet (not check-cap)
- [`../notes/2026-08-15-milestone-1-closeout.md`](../notes/2026-08-15-milestone-1-closeout.md)
  — Milestone 1 close-out (PR map, exit criteria met-by, carried-forward
  backlog); the 2026-08-12 direction note graduated into
  [ADR-0006](../decisions/0006-base-runtime-is-platform-resolved.md)–[ADR-0011](../decisions/0011-eject-rule.md)
  and was deleted
- [`../notes/2026-08-14-live-factory-baseline.md`](../notes/2026-08-14-live-factory-baseline.md)
  — live `sfab-lite-check` create OOM baseline (0/8)
- [`../notes/2026-08-14-units-retail.md`](../notes/2026-08-14-units-retail.md)
  — units re-tail after PR #134 (0/8 OOM, 0 retries; wall ~+60%)
- [`../notes/2026-08-14-assembled-recipes-check.md`](../notes/2026-08-14-assembled-recipes-check.md)
  — starter + first recipes local check (PR 7; production gate deferred)
- [`../notes/2026-08-14-pr8-starter-rebuild-check.md`](../notes/2026-08-14-pr8-starter-rebuild-check.md)
  — starter rebuilt from recipes (PR 8; local heaps)
- [`../notes/2026-08-15-cp4-retail.md`](../notes/2026-08-15-cp4-retail.md)
  — checkpoint 4 re-tail after PR #138 (0/8 OOM, 0 retries; wall ~13 s)
- [`../notes/2026-08-14-evidence-audit.md`](../notes/2026-08-14-evidence-audit.md)
  — grades for standing rejections (CheckDO, `@base-ui`, gzip, aged 1-in-4)
- [`../notes/2026-08-14-generator-spike.md`](../notes/2026-08-14-generator-spike.md)
  — generated cheap drizzle (works-with-seams; gates PR 5)
- [`../architecture/OVERVIEW.md`](../architecture/OVERVIEW.md) — import maps and
  the resolution gate
