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
| Worker upload | **10 MB gzip** | `apps/lint` / `apps/check` (CI hard-fail). Factory is warn-only — host console is ordinary software. |
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
(`packages/template/generated/seed.json`) and the entire TypeScript types
universe (`packages/kernel/src/generated/types-vfs.js`) are baked into the
bundle at build time.

The trap this creates is real and we hit it: editing the template without
re-baking leaves **every gate green** while the factory keeps seeding the old
source. `check:seed` and `check:kernel` exist because of that, and both work by
regenerating and diffing against the committed artifact.

### 2. Closure pruning, not whole-package dumps

The types VFS ships only the `.d.ts` closure the template's own TypeScript
program reaches, resolved against an isolated install
(`packages/kernel/universe`) so workspace peers cannot leak in. Whole-package
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

## Still open

- **The ADR-0004 win has been given back.** Measured 2026-07-27 with
  `measure-memory.mjs`, the same script that produced the numbers above:

  | | files loaded | retained heap |
  | --- | --- | --- |
  | before ADR-0004 | 877 | 330.5 MB |
  | after ADR-0004 | 645 | 263.1 MB |
  | **2026-07-27** | **1351** | **336.8 MB** |
  | **2026-08-13** | **1368** | **340 MB** |

  Retention is now *above* the pre-trim figure, and one create in four failed
  against the live factory. Technique 6 above stops that costing the app — an
  OOM is now a retry — but it is a mitigation and this is still a regression.
  Re-measured 2026-08-13 with `measure-memory.mjs` (APPS=1): 72 app source
  files, **339.5 MB** over the 88.7 MB VFS baseline — same ballpark as the
  2026-07-27 figure; the template has grown, not shrunk.

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

- **Runtime bundle diet.** Full write-up:
  [`../notes/2026-08-13-serve-upload-diet.md`](../notes/2026-08-13-serve-upload-diet.md).
  `apps/lint` is at 95.4% of the upload limit (Biome WASM). `apps/factory` at
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
  Measured 2026-08-13 with `apps/check/scripts/measure-zones.mjs` (same overlay-all /
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
  **Not adopted.** Local numbers never close a memory claim here; production
  verification of the server zone (the peak that has to fit) was not run —
  no Wrangler credentials on this host. Do not treat slice-checking, or
  per-capability-set vendoring, as the cap solution until that tail count
  exists. The separate requirement that the runtime's type surface not be
  *derived from the template* still stands; this experiment only falsifies
  "split today's program into zones and the cap is fine."

- **Eject copy-out is not real today.** Full write-up:
  [`../notes/2026-08-13-eject-copy-out.md`](../notes/2026-08-13-eject-copy-out.md).
  Unpacked the committed seed
  (`packages/template/generated/seed.json`, 81 files — what a live app
  actually is) into a fresh tree and ran `pnpm install && vite build`.
  `pnpm install` is a no-op: the seeded `package.json` has **no
  dependencies**. `vite build` then fails resolving `@tailwindcss/vite`,
  `@vitejs/plugin-react`, and `vite` itself from `vite.config.ts`. The seed
  also has **no `index.html`**. Recorded so the app-format RFC cannot claim
  eject. Generated `package.json` / `tsconfig` with real pins (decision 9)
  are load-bearing, not polish; price their absence as an eject regression
  if they do not ship with the format.

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
  at 41 MB. **Do not ship `any` overlays.** This is evidence for a pack-time
  specialized check surface aimed at drizzle / Hono / better-auth, not for
  zone-splitting today's VFS (already rejected).

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

- **`tsgo` forecast: faster here, not 2.9× RSS.** Full write-up:
  [`../notes/2026-08-13-tsgo-forecast.md`](../notes/2026-08-13-tsgo-forecast.md).
  See the rejected-table row. Pin stays 6.0.3.

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
- [`../notes/2026-08-13-thin-seed.md`](../notes/2026-08-13-thin-seed.md)
  — two-widget / thinner seed
- [`../notes/2026-08-13-tsgo-forecast.md`](../notes/2026-08-13-tsgo-forecast.md)
  — tsgo / TS 7 forecast
- [`../notes/2026-08-13-shallow-rpc.md`](../notes/2026-08-13-shallow-rpc.md)
  — shallow RPC (contracts, not `typeof api`)
- [`../notes/2026-08-13-serve-upload-diet.md`](../notes/2026-08-13-serve-upload-diet.md)
  — serve / upload diet (not check-cap)
- [`../notes/2026-08-12-lite-evolution-direction.md`](../notes/2026-08-12-lite-evolution-direction.md)
  — direction note
- [`../architecture/OVERVIEW.md`](../architecture/OVERVIEW.md) — import maps and
  the resolution gate
