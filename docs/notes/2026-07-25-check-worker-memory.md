# The check worker did not fit in a Worker isolate

**Date:** 2026-07-25
**Status:** resolved — 36% `exceededMemory` → 0 of 64 in production

## What happened

`sfab-lite-check` died with `outcome: exceededMemory` / "Worker exceeded memory
limit" on a large share of `/check` requests. It surfaced to a user as
`attempt_crashed` on app creation, after 9-17s, with a retry usually
succeeding — so it read as flakiness rather than as a limit being hit.

Measured baseline on version `82db5488`, `wrangler tail` across 8 real creates:

| outcome | count |
| --- | --- |
| `ok` | 7 |
| `exceededMemory` | **4** |
| total check calls | 11 |

**36%.** Seven of eight apps reached `ready`; one failed outright when both
retries died.

## Why

A Worker isolate gets **128 MB**, on every plan — there is no knob. One
TypeScript program over the frozen types VFS retained **~330 MB of Node heap**
(`apps/check/scripts/measure-memory.mjs`), loading **877 source files**.

Splitting that number into its two halves is what led to the fix:

| phase | retained | shareable? |
| --- | --- | --- |
| parse + bind (SourceFile ASTs) | 200.0 MB | in principle |
| check (instantiated types) | 130.5 MB | no |

Parse was the bigger half, so the next question was what was being parsed.

## The cause: dead SQL dialects

The app targets D1, i.e. SQLite. The program was loading all of drizzle's
other dialects anyway — **232 of its 301 files, 690 KB of `.d.ts`**:

| subtree | files | text | reachable from a sub-app? |
| --- | --- | --- | --- |
| `pg-core/` | 71 | 204 KB | no |
| `gel-core/` | 56 | 161 KB | no |
| `mysql-core/` | 54 | 164 KB | no |
| `singlestore-core/` | 49 | 153 KB | no |
| `sqlite-core/` + `d1/` + `sql/` + root | 69 | 223 KB | yes |

Not an app-level barrel import — the edge is inside drizzle:

```
/app/src/db/schema.ts
  └ drizzle-orm/index.d.ts
    └ drizzle-orm/column-builder.d.ts
      └ drizzle-orm/pg-core/index.d.ts
```

`column-builder.d.ts` declares three aliases that dispatch on a `TDialect`
type parameter — `BuildColumn`, `BuildIndexColumn`, `ChangeColumnTableName` —
each naming a column class per dialect in its own conditional branch. A D1 app
is always `TDialect = 'sqlite'`, so the other branches never instantiate, but
TypeScript still loads and binds all four dialect modules to **resolve** the
type references sitting inside branches it will never take.

## The fix

`packages/kernel/scripts/trim-drizzle-dialects.mjs` rewrites those three
aliases to their sqlite branch and drops the four imports, as a read filter
during the types-VFS closure build. Not a `node_modules` patch: the same read
path feeds both the program's module resolution and the text baked into the
VFS, so the two cannot disagree, and `pnpm install` stays idempotent.

| | before | after |
| --- | --- | --- |
| source files loaded | 877 | **645** |
| parse + bind | 200.0 MB | **132.9 MB** |
| check | 130.5 MB | 130.3 MB |
| **retained heap** | **330.5 MB** | **263.1 MB** |
| VFS files | 2,043 | 1,811 |
| VFS raw | 9.34 MB | 8.64 MB |

The check half is unchanged, exactly as the diagnosis predicts: those branches
were only ever resolved, never instantiated.

**This is capability removal, not a trick.** sfab-lite apps run on D1. There is
no Postgres, MySQL, Gel or SingleStore for them to reach, so the dialects were
dead surface that a sub-app could never have used.

## Production result

Deployed as version `4ce2c8af` and measured the same way:

| | baseline `82db5488` | slimmed `4ce2c8af` |
| --- | --- | --- |
| creates | 8 | **64** |
| check calls | 11 | **64** |
| `exceededMemory` | 4 (36%) | **0** |
| retries | 3 | **0** |
| apps `ready` | 7/8 | **64/64** |

Sixty-four calls, one per create, none retried. If the true rate were still
36%, observing zero in 64 tries has probability ~10⁻¹²; the 95% upper bound on
the rate is now under 5%.

`CHECK_ATTEMPTS` stays at 2. It costs nothing when checks pass first time and
it is what would absorb a regression — but it is no longer load bearing, and
**the wall-clock reasoning behind that 2 still applies**: see
`apps/factory/src/commit.ts`. Raising it without first moving the work off
`ctx.waitUntil` brings back the five-minute hang.

## Gates

Two, both red-tested before being trusted:

- `prebuild-types-vfs.mjs` throws if the trim never ran (drizzle moved the
  file, or the host read path changed).
- `assertNoDeadDialects()` asserts on the **finished artifact** rather than the
  code path, because the VFS is also topped up from disk afterwards
  (`ensureDualDeclSiblings` — `column-builder.d.cts` sits right next to the
  file being rewritten). Red-tested at 231 offending files.

Plus the standing `pnpm check:check-memory`, which still covers the separate
store-eviction bug fixed in PR #26.

## What was ruled out, with evidence

Recorded so none of it gets re-litigated:

**A shared `DocumentRegistry`.** The most attractive idea on paper — the 847
dependency `.d.ts` files are byte-identical for every app forever. But the
shared ASTs are then permanently resident, so peak becomes shared-parse +
per-app-check ≈ 195 + 130 = 325 MB. Identical. It buys time, not memory.

**Pruning the VFS of unopened files.** 1,196 VFS files are never opened. They
cost bundle size, not heap. (`measure-program.mjs`)

**Splitting the program into client and server halves.** Rooting only the
client entry still loads 876 of 877 files, because `src/ui/lib/api.ts` does
`hc<AppType>` against the server's Hono app type and that one `import type`
pulls in drizzle, better-auth and zod. Even cutting that link leaves the server
half at 703 files / 270 MB — ~82% of the union. (`measure-split.mjs`)

**Trimming `lib.dom.d.ts`.** It is 2.29 MB, 40% of all text the program loads
— but only **32 MB of heap**, ~10%. Declaration-heavy `.d.ts` parses far
cheaper per byte than generic-heavy library types. Do not expect 40% of heap
from 40% of text.

**Deep-importing `better-auth/plugins/organization`** instead of the barrel:
157 → 141 files, **2 MB**. Also blocked by the import-map resolution gate in
`resolve-modules.ts`, which refuses any specifier the runtime kernel does not
serve — so it needs a kernel import-map and vendor-entry change. Not worth it
for 2 MB of heap, but worth revisiting for *bundle* size, where the same change
would drop SIWE, passkey, 2FA and the rest from every app.

**More memory.** 128 MB is the limit on Free and Paid alike and there has been
no increase in 2026. Containers have configurable memory but break the
edge-native shape ADR-0001 committed to.

**TypeScript 7 / `tsgo`,** which uses ~2.9x less memory in `--noEmit` mode, is
excluded by the repo's standing TS 6.0.3 pin.

## The lesson worth keeping

Local verification of anything memory-related is worthless here: **local
workerd applies no memory limit** (`.agents/skills/cloudflare/references/
miniflare/gotchas.md` — "Memory | System dependent | No artificial limits").
An earlier "20/20 clean under `wrangler dev`" said nothing at all. Every number
in the production tables above came from `wrangler tail` against a real deploy.

## Still open

The 263 MB program has ~50 MB of headroom against a 128 MB isolate at the
observed Node-to-workerd ratio, and that headroom shrinks as the template
grows. The next lever, if it is ever needed, is **moving the create attempt off
`ctx.waitUntil`** to a DO alarm or Queue consumer, which does not reduce memory
but makes retries free. It stays unbuilt on purpose — it is a mitigation, and
this was a fix.
