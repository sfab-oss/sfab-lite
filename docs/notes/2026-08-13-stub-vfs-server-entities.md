# 2026-08-13 — Stub VFS on server entities

Non-authoritative (see [`README.md`](README.md)). Catalogue:
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).
Prior: [`2026-08-13-entities-only-check.md`](2026-08-13-entities-only-check.md).

**Status:** local done; **not adopted as shipping `any` overlays**; evidence that
a specialized check surface can fit this slice locally.

**Hypothesis:** The 135 MB server-entities import-closure program is expensive
because TypeScript is instantiating vendor generics (drizzle, Hono,
better-auth), not because of the route file. Overlaying tiny `.d.ts` stubs on
those VFS packages (same roots) drops retained heap under the 128 MB local
indicator — "compile the expensive library away."

## How to re-run

From the monorepo root, after `pnpm install` and
`pnpm --filter @sfab-lite/kernel install-universe`:

```bash
NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @sfab-lite/check measure:stub-vfs
```

Harness: `apps/check/scripts/measure-stub-vfs.ts`. Overlay wins in `readVfs`,
so stubbing `/node_modules/<pkg>/…` replaces frozen `TYPES_VFS` entries. Roots
stay `[/app/src/hono/org-protected/entities.ts]` plus ambient libs.

## What we ran

Host: Node 24, `--expose-gc`, 2026-08-13, worktree at `5d12a66` plus this
harness. Same 72-file seed as the entities-only run.

```
{"label":"server entities, real VFS","stubPrefixes":[],"stubbedFiles":0,"loadedFiles":473,"loadedTextMb":4.51,"diagnostics":0,"ms":2148,"heapRetainedMb":141}
{"label":"stub drizzle-orm","stubPrefixes":["/node_modules/drizzle-orm"],"stubbedFiles":70,"loadedFiles":407,"loadedTextMb":4.3,"diagnostics":0,"ms":1123,"heapRetainedMb":100}
{"label":"stub drizzle + hono","stubPrefixes":["/node_modules/drizzle-orm","/node_modules/hono"],"stubbedFiles":93,"loadedFiles":388,"loadedTextMb":4.15,"diagnostics":5,"ms":739,"heapRetainedMb":85}
{"label":"stub drizzle + hono + zod","stubPrefixes":["/node_modules/drizzle-orm","/node_modules/hono","/node_modules/zod"],"stubbedFiles":251,"loadedFiles":313,"loadedTextMb":3.95,"diagnostics":5,"ms":613,"heapRetainedMb":76}
{"label":"stub drizzle + hono + zod + better-auth family","stubPrefixes":["/node_modules/drizzle-orm","/node_modules/hono","/node_modules/zod","/node_modules/better-auth","/node_modules/@better-auth","/node_modules/better-call"],"stubbedFiles":513,"loadedFiles":85,"loadedTextMb":2.9,"diagnostics":5,"ms":401,"heapRetainedMb":44}
{"label":"stub + auth transitives (kysely, jose)","stubPrefixes":["/node_modules/drizzle-orm","/node_modules/hono","/node_modules/zod","/node_modules/better-auth","/node_modules/@better-auth","/node_modules/better-call","/node_modules/kysely","/node_modules/jose"],"stubbedFiles":809,"loadedFiles":85,"loadedTextMb":2.9,"diagnostics":5,"ms":398,"heapRetainedMb":44}
{"label":"stub all /node_modules","stubPrefixes":["/node_modules"],"stubbedFiles":2436,"loadedFiles":83,"loadedTextMb":2.73,"diagnostics":5,"ms":359,"heapRetainedMb":41}
```

| program | stubbed VFS files | loaded | heap |
| --- | ---: | ---: | ---: |
| real VFS (baseline) | 0 | 473 | **141 MB** |
| drizzle-orm only | 70 | 407 | 100 MB |
| + hono | 93 | 388 | 85 MB |
| + zod | 251 | 313 | 76 MB |
| + better-auth family | 513 | 85 | **44 MB** |
| + kysely, jose | 809 | 85 | 44 MB |
| all `/node_modules` | 2436 | 83 | 41 MB |

The 141 MB baseline is the same family as yesterday's 135 MB (run-to-run /
process shape). Better-auth (via `AppEnv` → `Auth`) is the large remaining
step after drizzle. Kysely/jose were not extra load once better-auth was
stubbed. The floor with every vendor file stubbed is **41 MB**.

Five diagnostics appear as soon as Hono is stubbed (`any` breaks the chain).
That is expected: this overlay is `any`, not an accurate compiled surface.

## Verdict

**The hypothesis holds as a local indicator, and is not a product we ship.**
Replacing vendor `.d.ts` with `any` takes this slice from 141 MB to **44 MB**,
under 128 MB locally. The check worker must not check against `any`. What this
justifies is a **pack-time specialized check surface** (accurate, cheap types
for the libraries the kernel actually serves) aimed at drizzle / Hono /
better-auth — the same AOT shape as the zod-compiler inspiration, pointed at
the packages that actually cost heap. Stub overlays in the worker are a
measurement, not an architecture.

## Does not imply

- That production would fit at 44 MB — still a local heap indicator.
- That we should skipLibCheck our way to green by lying about Hono.
- That slicing today's VFS into zones is back on the table (already rejected).
- That Zod is the cap lever — stubbing it saved 9 MB after drizzle+hono.

## Follow-ups

- Typed (not `any`) drizzle + Hono: done in
  [`2026-08-13-typed-cheap-stubs.md`](2026-08-13-typed-cheap-stubs.md)
  — 100 / 92 MB, planted errors caught.
- better-auth specialization is the remaining server-heap slice (~36 MB).
- Client page / union: thin seed and shallow RPC (own notes).
