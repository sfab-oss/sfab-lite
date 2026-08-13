# 2026-08-13 — Zone-check memory (today's VFS)

Non-authoritative (see [`README.md`](README.md)). Direction:
[`2026-08-12-lite-evolution-direction.md`](2026-08-12-lite-evolution-direction.md)
item 8a. Catalogue:
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).
Sibling: [`2026-08-13-eject-copy-out.md`](2026-08-13-eject-copy-out.md).

**Status:** local done; production tail **not run**; memory candidate **not adopted**.

**Hypothesis:** Split today's template into data / shared / server / client
programs against the *current* types VFS, and each program fits the 128 MB
isolate (local heap as an indicator, same family as ADR-0004 / 2026-07-27).

## How to re-run

From the monorepo root, after `pnpm install` and
`pnpm --filter @sfab-lite/kernel install-universe`:

```bash
NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @sfab-lite/check measure:zones
APPS=1 NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @sfab-lite/check measure:memory
```

`measure-zones.mjs` overlays every app file and only `roots` seed the program
(same harness as `measure-split.mjs`). `measure-memory.mjs` is `runCheck` over
the seed (worker-shaped union).

## What we ran

Host: Node 24, `--expose-gc`, 2026-08-13, `main` @ 85514db (PR #121 merged).
Template: 72 `.ts`/`.tsx` app sources in the seed.

### Union baseline (`measure-memory.mjs`, APPS=1)

```
app source files: 72, evict=false
baseline (VFS module loaded, no program): 88.7 MB
{"app":1,"diagnosticCount":0,"rootFileCount":132,"checkMs":6261,
 "heap":"428.3 MB","delta":"339.5 MB","overBaseline":"339.5 MB"}
```

Retained over baseline **339.5 MB**. 2026-07-27 was 336.8 MB / 1351 files;
zones-harness union today is 1368 files / 340 MB. The template has grown.

### Four programs (`measure-zones.mjs`)

```
{"label":"union (today)","roots":72,"loadedFiles":1368,"loadedTextMb":5.82,"diagnostics":3,"ms":6530,"heapRetainedMb":340}
{"label":"data-only","roots":6,"loadedFiles":140,"loadedTextMb":3.1,"diagnostics":0,"ms":1290,"heapRetainedMb":77}
{"label":"shared-only","roots":4,"loadedFiles":145,"loadedTextMb":3.07,"diagnostics":0,"ms":479,"heapRetainedMb":53}
{"label":"server, client edge cut","roots":1,"loadedFiles":487,"loadedTextMb":4.55,"diagnostics":0,"ms":2995,"heapRetainedMb":215}
{"label":"generated api.d.ts","bytes":12507,"mentionsDrizzle":false,"mentionsHonoIndex":false}
{"label":"client vs generated API .d.ts","roots":1,"loadedFiles":1250,"loadedTextMb":5.47,"diagnostics":1,"ms":1437,"heapRetainedMb":145}
{"label":"summary","unionHeapMb":340,"peakSliceHeapMb":215,"isolateCapMb":128,"slicesVsUnion":0.63}
```

| program | roots | files loaded | retained heap |
| --- | --- | --- | --- |
| union (today) | 72 | 1368 | 340 MB |
| data-only (`/app/src/db/`) | 6 | 140 | **77 MB** |
| shared-only (`/app/src/contract/`) | 4 | 145 | **53 MB** |
| server, client edge cut (`hono/index.ts`) | 1 | 487 | **215 MB** |
| client vs generated API `.d.ts` | 1 | 1250 | **145 MB** |
| *peak of the four* | — | — | **215 MB** |

Roots: data = every file under `src/db/`; shared = every file under
`src/contract/`; server = `/app/src/hono/index.ts` only (UI stays in the
overlay so imports would resolve — they are not pulled); client =
`/app/src/ui/main.tsx` after rewriting `client.ts` to
`import type { ApiType } from "./api"`.

Generated `api.d.ts` is `export type ApiType = ${typeToString(typeof api)}`
from the server program, 12.5 KB. Preview started
`HonoBase<AppEnv, …MergeSchemaPath<{ "/health": …`. No `drizzle` substring,
no `hono/index` path. One client diagnostic (unresolved `AppEnv`). Heap
**145 MB** matches the 2026-07-27 `hc<any>` stub (~144 MB).

## Verdict

**Not adopted.** Splitting today's VFS into zones does not fit locally.
Peak is 63% of the union; the expensive half did not shrink (215 MB is the
2026-07-27 server-only 213 MB re-derived). Generated `typeof api` severs
drizzle and does not save the client from React / base-ui.

Per-capability-set vendoring (smaller VFS per zone) was **not** measured.
Production `wrangler tail` of the server zone was **not** run (`wrangler
whoami` unauthenticated). Local heap is an indicator, not isolate accounting:
ADR-0004's 263 MB local was 0/64 prod OOMs, 330 MB was 36%, so 215 MB is
still ambiguous until a tail exists.

## Does not imply

- That the runtime's type surface may stay derived from the template
  (independence still required).
- That sequential zone checking in production would OOM — that needs a
  throwaway `sfab-lite-check-exp` tail, not an overwrite of `sfab-lite-check`.
- That a stub/compiled check surface, affected-file check, thinner seed, or
  `tsgo` forecast would fail — those are other files.

## Follow-ups

- Prod tail of **server, client edge cut** when Wrangler is available; record
  `exceededMemory` here and in `making-it-fit.md`.
- Next local bets (each their own note): entities-only check; stub VFS for
  that slice; two-widget seed; `tsgo` union forecast; shallow RPC from
  `src/contract/`.
