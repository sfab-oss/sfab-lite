# 2026-08-13 — Typed cheap vendor stubs

Non-authoritative (see [`README.md`](README.md)). Catalogue:
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).
Prior: [`2026-08-13-stub-vfs-server-entities.md`](2026-08-13-stub-vfs-server-entities.md)
(`any` overlays).

**Status:** local done; **`any` was not doing the work** for drizzle.
Accurate cheap `.d.ts` stay at the stub heaps and catch planted errors.
Still not a product we ship as handwritten overlays.

**Hypothesis:** The 141 → 100 MB drizzle drop was `any` erasing work, so a
specialized check surface that still types `.select().from(entity)` would
balloon back toward 141. If heap stays near the `any` rows *and* a planted
`eq(entity.id, 0)` / `name: 123` still errors, compiled check types are a
real road.

## How to re-run

From the monorepo root, after `pnpm install` and
`pnpm --filter @sfab-lite/kernel install-universe`:

```bash
NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @sfab-lite/check measure:typed-stubs
```

Harness: `apps/check/scripts/measure-typed-stubs.ts`. Same overlay-wins /
server-entities import-closure roots as `measure-stub-vfs`. Handwritten
sqlite-only drizzle surface (columns, query chain, insert/update/delete) and
a Hono class that does **not** accumulate route schema. Red-test overlays
`eq(entity.id, 0)` and `name: 123` on the insert.

## What we ran

Host: Node 24, `--expose-gc`, 2026-08-13, worktree at `0e7c3e5` plus this
harness.

```
{"label":"server entities, real VFS","stubbedFiles":0,"loadedFiles":473,"diagnostics":0,"ms":2109,"heapRetainedMb":141}
{"label":"any drizzle","stubbedFiles":70,"loadedFiles":407,"diagnostics":0,"ms":1119,"heapRetainedMb":100}
{"label":"typed drizzle","stubbedFiles":70,"loadedFiles":407,"diagnostics":0,"ms":1124,"heapRetainedMb":100}
{"label":"typed drizzle + any better-auth","stubbedFiles":332,"loadedFiles":180,"diagnostics":0,"ms":692,"heapRetainedMb":64}
{"label":"any drizzle + hono","stubbedFiles":93,"loadedFiles":388,"diagnostics":5,"ms":714,"heapRetainedMb":85}
{"label":"typed drizzle + hono","stubbedFiles":93,"loadedFiles":388,"diagnostics":0,"ms":1006,"heapRetainedMb":92}
{"label":"broken entities, real VFS","diagnostics":2,"diagnosticSample":["TS2769: No overload matches this call.","TS2769: No overload matches this call."],"heapRetainedMb":135}
{"label":"broken entities, any drizzle + hono","diagnostics":5,"diagnosticSample":["TS2347: Untyped function calls may not accept type arguments.","TS7006: Parameter 'c' implicitly has an 'any' type.", "..."],"heapRetainedMb":85}
{"label":"broken entities, typed drizzle + hono","diagnostics":2,"diagnosticSample":["TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.","TS2322: Type 'number' is not assignable to type 'string'."],"heapRetainedMb":93}
```

| program | diags | heap |
| --- | ---: | ---: |
| real VFS | 0 | **141 MB** |
| `any` drizzle | 0 | **100 MB** |
| **typed drizzle** | **0** | **100 MB** |
| typed drizzle + `any` better-auth | 0 | 64 MB |
| `any` drizzle + hono | 5 (noise) | 85 MB |
| **typed drizzle + hono** | **0** | **92 MB** |

Planted errors (`eq(entity.id, 0)`, `name: 123`):

| surface | catches the plant? | what we see |
| --- | --- | --- |
| real drizzle | yes | TS2769 overload (opaque) |
| `any` drizzle + hono | **no** | only Hono `any` noise (TS2347 / TS7006) |
| typed drizzle + hono | **yes** | TS2345 / TS2322 number vs string |

## Verdict

**Hypothesis rejected: `any` was not the win.** Typed drizzle is the same
100 MB as `any` drizzle, healthy file stays green. Typed Hono costs ~7 MB
vs `any` Hono (92 vs 85) and *removes* the five false diagnostics. Together
they sit under the 128 MB local indicator. The same surface reports the
planted column/value mismatches; `any` does not.

Do not commit these handwritten `.d.ts` as the check worker's VFS. They are
a proof that a **specialized, accurate, sqlite/Hono-shaped check surface**
can be cheap. Pack-time generation (or a maintained kernel types pack) is
the product shape. better-auth is still the remaining chunk (~36 MB from
100 → 64 when it is stubbed `any`); this note does not type that package.

## Does not imply

- Production fit at 92 MB — still a local indicator.
- That a full Hono route-tree generic (what `hc<typeof api>` needs) is
  cheap — this Hono stub deliberately does not accumulate routes.
- That we should stop typechecking against real vendor `.d.ts` in the
  agent's editor; this is the *check worker* surface.

## Follow-ups

- Compiled / kernel-owned drizzle + Hono check types as an implementation
  PR, not another research round.
- Stacked with shallow RPC on the union:
  [`2026-08-13-stack-typed-shallow.md`](2026-08-13-stack-typed-shallow.md)
  — union **255 MB**, not a fit.
- better-auth specialization is a separate, smaller heap bet (64 vs 100).
