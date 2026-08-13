# 2026-08-13 — Snapshot route-module fragments

Non-authoritative (see [`README.md`](README.md)). Catalogue:
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).
Parent: [`2026-08-13-snapshot-accumulating-hono.md`](2026-08-13-snapshot-accumulating-hono.md)
(full-server accumulating emit, 146 MB).

**Status:** local done; per-module emit **stays on the non-accumulating
floor** (92 MB). Prefix-merge into the whole-server snapshot is
concatenation of mapped entries — confirmed by shape, not by a second
checker pass.

**Hypothesis:** The same accumulating surface over **one** route
module's closure (entities) emits a fragment whose keys merge into the
whole-server snapshot under a path prefix, bounding per-edit
regeneration to the changed module.

## How to re-run

Same command as the parent note
(`pnpm --filter @sfab-lite/check measure:snapshot`). The harness roots
a synthetic `/app/src/hono/_fragment.ts`:

```ts
import { entityRoutes } from "./org-protected/entities";
export type ApiType = typeof entityRoutes;
```

Rows: `entities module, accumulating emit` and
`entities fragment api.d.ts`. Compare keys to the full-server
`generated api.d.ts` row (`/protected/entities`, `/protected/entities/:id`).

## What we ran

Host: Node v24.5.0, `--expose-gc`, 2026-08-13,
`oracle-cool-big-child-1`, worktree at `af322fb` plus this harness.

```
{"label":"entities module, accumulating emit","diagnostics":0,"ms":850,"heapRetainedMb":92,"apiDtsBytes":1383,"mentionsDrizzle":false,"pathCount":2,"methodCount":4}
{"label":"entities fragment api.d.ts","bytes":1383,"pathCount":2,"methodCount":4,"mentionsDrizzle":false,"unresolvedNames":false}
{"label":"server, typed drizzle+hono (no accum)","heapRetainedMb":93}
{"label":"server, typed drizzle+accumulating hono","heapRetainedMb":146,"pathCount":12,"methodCount":18}
```

Fragment preview (unprefixed module paths):

```
{ "/": { "$get": { input: {}; output: { "data": Array<{ "id": null | string; …; "createdAt": Date; "updatedAt": Date }>; "total": number; "page": number; "pageSize": number }; … }; "$post": … }; "/:id": { "$patch": …; "$delete": … } }
```

Full-server snapshot contains `/protected/entities` and
`/protected/entities/:id` with the same GET `data` row shape. Type-level
merge is `Prefixed<"/protected/entities", Fragment>` — join `/` with
the prefix to `/protected/entities`, join `/:id` to
`/protected/entities/:id`. Not a third LanguageService program in this
harness; the two emits already have the matching entries.

## Verdict

**Hypothesis holds for heap.** One route module's accumulating emit is
**92 MB** / 1.4 KB / 4 methods — the same floor as non-accumulating
typed Hono on the full server (93) and as public-only accumulation
(92). Full-server accumulation (146) is the whole tree in one schema,
not a per-module tax.

Per-edit snapshot regen can stay on the cheap floor if it re-emits
only the changed module and prefix-merges into the stored snapshot.
That is the product-shaped follow-up; this note does not ship it.

## Does not imply

- Production fit at 92 MB.
- That merging N fragments in one program stays at 92 — only one
  module was measured.
- That the client should import per-module fragments instead of one
  `api.d.ts`.

## Follow-ups

- Implementation: store one snapshot; on edit, re-emit the owning
  route module and write the prefixed entries over the previous ones.
- Parent note for the full-server pass that does **not** fit locally:
  [`2026-08-13-snapshot-accumulating-hono.md`](2026-08-13-snapshot-accumulating-hono.md).
