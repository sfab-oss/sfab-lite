# 2026-08-13 — Stack typed stubs + shallow RPC

Non-authoritative (see [`README.md`](README.md)). Catalogue:
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).
Priors: [`2026-08-13-typed-cheap-stubs.md`](2026-08-13-typed-cheap-stubs.md)
(92 MB server-entities), [`2026-08-13-shallow-rpc.md`](2026-08-13-shallow-rpc.md)
(148 MB entities page).

**Status:** local done; **the whole-app union does not fit**; stacking is
not additive. The two cuts remain the architecture — as **separate check
units**, not one program.

**Hypothesis:** Typed drizzle+Hono (92 MB on one server file) plus shallow
RPC (148 MB on the entities page) compose. If the union lands near those
components, the road is confirmed locally for checking the whole app.

## How to re-run

From the monorepo root, after `pnpm install` and
`pnpm --filter @sfab-lite/kernel install-universe`:

```bash
NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @sfab-lite/check measure:stack
```

Harness: `apps/check/scripts/measure-stack.ts` (overlays in
`experiment-overlays.ts`, same typed `.d.ts` and shallow client/hooks as
the earlier notes). Union roots are `/app/src/**` only (71 files — what
the check worker seeds, not `vite.config.ts`).

## What we ran

Host: Node 24, `--expose-gc`, 2026-08-13, `main` @ b0e72f7 plus this
harness.

```
{"label":"union (today)","programRoots":71,"loadedFiles":1367,"diagnostics":0,"ms":6353,"heapRetainedMb":340}
{"label":"union, typed drizzle+hono","programRoots":71,"stubbedFiles":93,"loadedFiles":1282,"diagnostics":41,"ms":4641,"heapRetainedMb":254}
{"label":"union, shallow RPC","programRoots":71,"loadedFiles":1367,"diagnostics":22,"ms":5634,"heapRetainedMb":327}
{"label":"union, stacked","programRoots":71,"stubbedFiles":93,"loadedFiles":1281,"diagnostics":51,"ms":4585,"heapRetainedMb":255}
{"label":"entities page (today)","programRoots":1,"loadedFiles":1347,"diagnostics":0,"ms":3865,"heapRetainedMb":283}
{"label":"entities page, typed drizzle+hono","programRoots":1,"loadedFiles":1262,"diagnostics":1,"ms":1828,"heapRetainedMb":159}
{"label":"entities page, shallow RPC","programRoots":1,"loadedFiles":1213,"diagnostics":0,"ms":1611,"heapRetainedMb":149}
{"label":"entities page, stacked","programRoots":1,"loadedFiles":1213,"diagnostics":0,"ms":1605,"heapRetainedMb":147}
```

| program | today | typed only | shallow only | stacked |
| --- | ---: | ---: | ---: | ---: |
| union (71 `/app/src` roots) | **340 MB** | **254 MB** | 327 MB | **255 MB** |
| entities page (import closure) | 283 MB | 159 MB | 149 MB | **147 MB** |

Typed-union diagnostics (41) are the handwritten Hono/drizzle surface not
covering the rest of the template: `hono/factory` missing, `.use(path, mw)`
arity, `insert().values(array)` vs a single row. Shallow-union extras are
the overlay's `../../contract/…` paths and `unknown` rows. Stacked is the
union of those (51). The page stacked is green.

## Verdict

**Hypothesis rejected for the union.** 92 and 148 do not compose into one
program. The check worker typechecks every root; heap follows that pass.
Stacked union is **255 MB** — same as typed-only 254, still 2× the 128 MB
indicator. Shallow RPC does not further shrink the union once Hono is
already cheap (`typeof api` is no longer an expensive tree).

The entities page stacked at **147 MB** matches shallow-only (149) and the
old generated-`api.d.ts` floor (~145). Typed Hono alone already cuts the
page 283 → 159 (it severs the client→server inference). UI types remain
the floor; a shell-importing route still does not fit.

What this confirms: **specialized server types + a client edge that is not
`hc<typeof api>`**, used as **two check units** (or import-closure of the
edited file), not as today's 71-root union. The union is not the thing
that will fit.

## Does not imply

- Production fit at 255 or 147 MB.
- That a complete kernel-owned Hono/drizzle pack (covering `hono/factory`,
  batch `values`, etc.) would drop the union under 128 — it would have to
  beat the UI half, which is already ~147 on one page.
- That we should check the union with 41–51 false diagnostics.

## Follow-ups

- Implementation: kernel-owned check types + contract-typed client; seed
  the program from the edited file's import closure.
- Do not run another stack. Prod tail of today's union when Wrangler is
  authenticated.
