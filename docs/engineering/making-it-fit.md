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
| Worker upload | **10 MB gzip** | `apps/lint` at 9.09 MiB (95.4%) |
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
(`apps/factory/src/generated/seed.json`) and the entire TypeScript types
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
| TypeScript 7 / `tsgo` (~2.9x less memory) | Excluded by the repo's TS 6.0.3 pin | — |

## Still open

- **The ADR-0004 win has been given back.** Measured 2026-07-27 with
  `measure-memory.mjs`, the same script that produced the numbers above:

  | | files loaded | retained heap |
  | --- | --- | --- |
  | before ADR-0004 | 877 | 330.5 MB |
  | after ADR-0004 | 645 | 263.1 MB |
  | **2026-07-27** | **1351** | **336.8 MB** |

  Retention is now *above* the pre-trim figure. It is felt in production as app
  creation hanging: the check worker OOMs, `runCommitAttempt` dies under
  `ctx.waitUntil` without writing a terminal status, and the app sits in
  `creating` past the stale sweep. One in four creates, measured against the
  live factory.

  `check:check-memory` passes throughout, because it bounds *growth between
  apps* (+9.1 MB against a 50 MB limit) and never looks at the absolute floor.
  It is the third instance of the pattern in the last lesson below, and it
  wants an absolute ceiling.

  The icon collapse in the rejected table above was the first hypothesis and
  accounted for 4 MB of it. The open question is `@base-ui/react` at 373 loaded
  files against the 22 recorded when the exception was written.

- **Move the create attempt off `ctx.waitUntil`** to a DO alarm or Queue
  consumer. Does not reduce memory; makes retries free. Written up as a
  mitigation not worth building while the memory problem had a fix — that
  premise no longer holds, and it is now what stands between an OOM and an app
  stuck in `creating` for five minutes.
- **Runtime bundle diet.** `apps/lint` is at 95.4% of the upload limit (Biome
  WASM). `apps/factory` at 57.5% carries the vendor bundles, where the
  `better-auth` barrel is 2.1 MB. See ADR-0004's candidate list.
- **Client kernel is unminified** — `browserShared` has no `minify: true`.

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
- [`../architecture/OVERVIEW.md`](../architecture/OVERVIEW.md) — import maps and
  the resolution gate
