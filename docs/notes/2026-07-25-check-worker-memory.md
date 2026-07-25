# The check worker does not fit in a Worker isolate

**Date:** 2026-07-25
**Status:** open problem, mitigated but not solved
**Task:** S3.5

## What happens

`sfab-lite-check` dies with `outcome: exceededMemory` / "Worker exceeded memory
limit" on roughly half of all `/check` requests in production. It surfaces to a
user as `attempt_crashed` on app creation, after 9-17s, with a retry usually
succeeding — so it reads as flakiness rather than as a limit being hit.

Confirmed by `wrangler tail` across all three workers during six creates:

| worker | outcomes |
| --- | --- |
| `sfab-lite-check` | **exceededMemory ×3**, ok ×2 |
| `sfab-lite-lint` | ok ×5 |
| `sfab-lite-factory` | ok ×45 |

## Why

A Worker isolate gets **128 MB**. One TypeScript program over the frozen types
VFS retains **~330 MB of Node heap** — measured, not estimated, by
`apps/check/scripts/measure-memory.mjs`.

The program loads **877 source files / 5.74 MB of text**, out of 2,043 files in
the VFS. Node heap is not workerd heap, but the ratio is stable enough to place
real usage right at the 128 MB line, which is exactly why the failure is
intermittent rather than total.

What the program loads, by package:

| | files | text |
| --- | --- | --- |
| `libs` (lib.dom is 2.29 MB of it) | 60 | 2.69 MB |
| `drizzle-orm` | 301 | 0.89 MB |
| `better-auth` | 157 | 0.79 MB |
| `@better-auth/core` | 90 | 0.29 MB |
| `zod` | 77 | 0.21 MB |
| everything else | 192 | 0.87 MB |

1,196 VFS files are **never opened** — mostly `@base-ui/react` (779 of 801),
`kysely` (265), and `csstype`. Pruning them shrinks the upload, not the heap.

## Two fixes that were tried and are not enough

**Bounding the LS store (shipped, PR #26).** The store held an `AppLsState` per
`appId` and never evicted, so the *second* distinct app in an isolate built its
program while the first was still retained. Fixing that took heap growth across
six apps from +1,605 MB to +8 MB and production creates from 2/6 to 4/6. It was
a real leak and it is fixed — but a single program still straddles the limit.

Note the local verification of that fix was worth less than it looked: local
workerd applies **no memory limit** (`.agents/skills/cloudflare/references/
miniflare/gotchas.md` — "Memory | System dependent | No artificial limits"), so
20/20 clean under `wrangler dev` said nothing about production.

**Splitting the program into client and server halves.** Measured with
`apps/check/scripts/measure-split.mjs` and **refuted**: rooting only the client
entry still loads **876 of the 877 files**, because `src/ui/lib/api.ts` does
`hc<AppType>` against the server's Hono app type, and that one `import type`
pulls the whole server graph — drizzle, better-auth, zod — into the client's
closure.

Cutting that link drops the client half to 543 files / 109 MB, but the **server
half alone is 703 files / 270 MB**, i.e. ~82% of the union. So no split fits,
even at the cost of the template's RPC type safety.

## What is shipped instead

`callCheck` retries a *thrown* service-binding call up to `CHECK_ATTEMPTS` (4)
times. An `exceededMemory` kill throws rather than returning a status, so this
retries isolate deaths and never retries a real check result. Attempts are
recorded as `checkAttempts` on the attempt payload so the OOM rate stays
visible rather than hiding inside a slower commit.

This is a mitigation. It takes first-try success from ~50% to ~94% and costs a
worst-case create ~45s.

## The actual options

None of these are cheap, and the choice is a product decision:

1. **Shrink the app's type surface.** drizzle-orm + better-auth + zod are ~550
   of the 877 loaded files. Replacing drizzle with hand-written SQL types, or
   better-auth with something smaller, would move the number — and change what
   the template is.
2. **Check somewhere with more memory.** Containers have configurable memory;
   Durable Objects do not (same 128 MB). This breaks the "edge-native lite"
   shape ADR-0001 committed to, so it deserves its own ADR.
3. **Weaken the gate.** Syntactic diagnostics plus a narrow semantic subset fit
   easily. This trades the guarantee that a committed app typechecks.
4. **Keep retrying.** Works today at ~94%, degrades if the template grows.

The thing not to do is trim the VFS and expect it to help: the 1,196 unopened
files cost bundle size, not heap.
