# The ADR-0004 memory win has been given back

**Date:** 2026-07-27
**Status:** cause narrowed, fix not chosen
**Prompted by:** app creation hanging in the console with "app creation timed out"

## What the user sees

Sending the first message from the blank chat state sits for two minutes and
then fails. `waitForAppReady` (`apps/factory/ui/src/features/chat/page.tsx`)
polls for `APP_READY_TIMEOUT_MS = 120_000` and throws.

Measured against the live factory, creating four apps through
`POST /admin/apps`:

| app | outcome |
| --- | --- |
| 1 | ready, 15 s |
| 2 | **stuck in `creating`**, still stuck 12 min later |
| 3 | ready, 23 s |
| 4 | ready, 22 s |

The stuck app's attempt reads `status=pending`, `payload=null` — it never wrote
a terminal status. That is `runCommitAttempt` dying under `ctx.waitUntil`
before it could settle, which is the failure `commit.ts` already documents.

**The sweep is not implicated.** An earlier draft of this note claimed the app
was still `creating` twelve minutes past a five-minute threshold. It was three
minutes old at that check — conversation time mistaken for the row's
`createdAt`. Re-checked at 37 minutes it reads `failed`, which is
`sweepStaleCreating` doing exactly its job.

What the row does show is a **gap between two deadlines**: the console gives up
at `APP_READY_TIMEOUT_MS = 120_000`, while `STALE_ATTEMPT_MS` is 300_000. For
three minutes a create that has already died looks, to everything except the
sweep, like one still in progress — and the user has been shown a hard error
for it.

## The regression

Measured with `apps/check/scripts/measure-memory.mjs` — the same script that
produced the numbers in ADR-0004, so these are comparable.

| | files loaded | retained heap |
| --- | --- | --- |
| before ADR-0004 | 877 | 330.5 MB |
| after ADR-0004 | 645 | 263.1 MB |
| **2026-07-27** | **1351** | **336.8 MB** |

Retention is above where it sat *before* the trim. ADR-0004 pairs 263 MB with
0 of 64 production OOMs and 330 MB with 36% — and the ~25% create failure rate
measured above lands where that table predicts. The metric is not workerd's
accounting, but as a relative indicator it is tracking the real failure rate.

### The gate did not notice

`check:check-memory` passed throughout, reporting
`{"storeSize":1,"growthMb":9.1,"limitMb":50}`. It bounds *growth between apps*
and never looks at the absolute floor, so a 74 MB regression in the first
program is invisible to it. It wants an absolute ceiling.

This is the third instance of the pattern in `making-it-fit.md`'s last lesson:
a correct check at one layer certifying a broken product.

## Where the growth is

`measure-program.mjs`:

```
program: 1351 source files, 5.81 MB of text
   0.57 MB   373 loaded /  1151 in VFS  @base-ui/react
   0.09 MB   320 loaded /   321 in VFS  @radix-ui/react-icons
```

`making-it-fit.md` recorded the `@base-ui/react` exception as "800 files, 22
loaded". It is now 1151 in the VFS with **373 loaded**. The template imports
eight subpaths — `use-render`, `merge-props`, `tooltip`, `menu`, `input`,
`dialog`, `button`, `avatar` — across eight component files. That is real
usage introduced by the template port, not a packaging accident, which is why
ADR-0004's technique does not apply: this surface is reachable.

## Heap tracks checking, not loading

The most useful thing measured today, and it redirects the whole search.
`measure-split.mjs` (a harness only — no split exists in the check worker; it
seeds programs from `src/ui/main.tsx` or `src/hono/index.ts` and runs a
semantic pass over those roots alone):

| program | files loaded | retained heap |
| --- | --- | --- |
| union (what the worker really does) | 1351 | 337 MB |
| client-only | 1350 | 170 MB |
| server-only | 474 | 213 MB |
| client-only, `AppType` stubbed | 1246 | 144 MB |

Client-only loads **1350 of 1351 files and retains half the heap**. Server-only
loads a third of the files and retains more. Heap follows the semantic pass
over the roots, not the number of files resolved into the program.

That predicts, and explains, the icon result below. It also means VFS-shrinking
and file-count-trimming are the wrong instruments unless they remove work the
checker is actually doing.

### Splitting still does not fit — for a stronger reason than recorded

`making-it-fit.md` rejects the client/server split because the server half was
"703 files / 270 MB (~82%)". Re-measured, the real objection is simpler: at 213
MB and 170 MB, **neither half fits a 128 MB isolate**. There is no partition of
this program that fits.

## Tried and rejected today: collapsing `@radix-ui/react-icons`

The kernel serves the barrel and refuses deep imports, so one icon opens all
320 per-icon files. Each is four lines declaring one
`ForwardRefExoticComponent`. Collapsing the barrel to inline declarations (a
read filter in the closure build, same mechanism as
`trim-drizzle-dialects.mjs`):

| | files loaded | retained heap |
| --- | --- | --- |
| before | 1351 | 336.8 MB |
| after | 1033 | 332.7 MB |

**318 files for 4.1 MB**, at or below run-to-run noise. Reverted, and recorded
in the rejected table.

The forecast that motivated it — 0.29 MB/file from ADR-0004, so ~90 MB — was
wrong because ADR-0004's 232 files were drizzle's generic-heavy dialect
modules. File count is not a cost model. `making-it-fit.md` says text size does
not predict heap; file count does not either.

## What to do

Reducing heap below ~263 MB means shedding ~74 MB from surface the template
genuinely uses, with the split ruled out and file-count trimming shown to be
the wrong lever. That is open-ended.

The tractable move was the one `making-it-fit.md` listed as still open —
moving the create attempt off `ctx.waitUntil` — and it is **built** (technique
6 there). It does not reduce heap by a byte; it stops the heap costing the
app. An OOM is now a retry, and that holds regardless of what the memory does
next.

Two things fell out of it that are worth recording separately:

- The **exhaustion path** needed no new plumbing. `sweepStaleCreating` already
  asked the AppDO for the attempt's real status — it just waited out
  `STALE_ATTEMPT_MS` before asking. A terminal attempt is terminal whatever the
  clock says, so the age filter now applies only to rows with no attempt id to
  ask about. The 120 s / 300 s gap noted above closes as a consequence rather
  than as a fix of its own.
- **Age was the wrong trigger all along.** The cutoff was there to tell a dead
  attempt from a live one, which is a question the DO can answer directly.
  Reaching for a clock is worth a second look whenever an authority is already
  in the call.

Still outstanding, and cheap:

- **An absolute ceiling in `check:check-memory`**, not only a growth bound.

## Related

- [ADR-0004](../decisions/0004-trim-unreachable-vendor-surface.md)
- [`../engineering/making-it-fit.md`](../engineering/making-it-fit.md)
- [`2026-07-25-check-worker-memory.md`](2026-07-25-check-worker-memory.md)
