# 2026-08-13 — Snapshot from cheap accumulating Hono

Non-authoritative (see [`README.md`](README.md)). Catalogue:
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).
Priors: [`2026-08-13-typed-cheap-stubs.md`](2026-08-13-typed-cheap-stubs.md)
(92 MB, Hono does not accumulate), [`2026-08-13-zone-check-memory.md`](2026-08-13-zone-check-memory.md)
(real-types `api.d.ts` via `typeToString`, 12.5 KB, unresolved `AppEnv`),
[`2026-08-13-stack-typed-shallow.md`](2026-08-13-stack-typed-shallow.md)
(union does not fit; two check units). Sibling:
[`2026-08-13-snapshot-route-fragments.md`](2026-08-13-snapshot-route-fragments.md).

**Status:** local done; accumulation **misses the ≤130 MB target** (146)
and the 128 MB isolate indicator, but **beats real Hono** (222) and
**does emit a standalone snapshot** the client checks against. Do not
put route accumulation on the ordinary server check if that check must
fit.

**Hypothesis:** A cheap Hono `.d.ts` that accumulates
`{ path: { method: { input; output } } }` via mapped types, stacked with
typed drizzle, keeps the `/app/src/hono/index.ts` import-closure check
near **92–130 MB** local, and `ApiType` from that program prints to a
valid standalone `api.d.ts` the client checks green against.

## How to re-run

From the monorepo root, after `pnpm install` and
`pnpm --filter @sfab-lite/kernel install-universe`:

```bash
NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @sfab-lite/check measure:snapshot
```

Harness: `apps/check/scripts/measure-snapshot.ts` via `run-measure.mjs`.
Overlays in `experiment-overlays.ts` (`HONO_ACCUMULATING`). Roots are
`/app/src/hono/index.ts` import closure (worker-shaped, not
`vite.config.ts`). Emit walks `_schema` structurally so the file does
not keep `import("hono").RouteEntry` / drizzle paths. Red-tests: planted
`eq(entity.id, 0)` / `name: 123` on the server pass; entities GET
`data` → `items` regenerates the snapshot and breaks a probe that reads
`body.data`.

## What we ran

Host: Node v24.5.0, `--expose-gc`, 2026-08-13,
`oracle-cool-big-child-1`, worktree at `af322fb` plus this harness.

```
{"label":"server, real VFS","diagnostics":0,"ms":3201,"heapRetainedMb":222}
{"label":"server, typed drizzle+hono (no accum)","diagnostics":0,"ms":972,"heapRetainedMb":93}
{"label":"server, typed drizzle+accumulating hono","diagnostics":0,"ms":1991,"heapRetainedMb":146,"apiDtsBytes":6236,"mentionsDrizzle":false,"mentionsHonoIndex":false,"unresolvedNames":false,"pathCount":12,"methodCount":18}
{"label":"client vs snapshot","diagnostics":1,"diagnosticSample":["TS2882: Cannot find module or type declarations for side-effect import of './styles.css'."],"heapRetainedMb":175}
{"label":"snapshot standalone (api.d.ts only)","diagnostics":0,"heapRetainedMb":39}
{"label":"broken entities, accumulating","diagnostics":2,"diagnosticSample":["TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.","TS2322: Type 'number' is not assignable to type 'string'."],"heapRetainedMb":94}
{"label":"freshness probe vs healthy snapshot","diagnostics":0,"heapRetainedMb":43}
{"label":"freshness probe vs stale snapshot","diagnostics":1,"diagnosticSample":["TS2339: Property 'data' does not exist on type '{ items: … }'."],"heapRetainedMb":43}
{"label":"scale: public routes only","heapRetainedMb":92,"pathCount":1,"methodCount":1,"apiDtsBytes":145}
{"label":"scale: public + entities","heapRetainedMb":93,"pathCount":3,"methodCount":5,"apiDtsBytes":1539}
```

| program | diags | heap |
| --- | ---: | ---: |
| server, real VFS | 0 | **222 MB** |
| typed drizzle+Hono, no accum | 0 | **93 MB** |
| typed drizzle+**accumulating** Hono + emit | 0 | **146 MB** |
| client vs snapshot (`hc<Hono<any, ApiType>>`) | 1 (seed `styles.css`) | 175 MB |
| snapshot file alone | 0 | 39 MB |

`api.d.ts`: **6236 bytes**, 12 paths / 18 methods, no `drizzle`, no
`hono/index`, no `AppEnv`. Preview starts
`{ "/health": { "$get": { input: {}; output: { "ok": boolean; "service": string }; …`.
The zone-check `AppEnv` wart is gone. Client diagnostic is the seed's
side-effect `./styles.css` import on `main.tsx` — not an unresolved
snapshot name. `use-entities.ts` is green against the snapshot.

Planted handler bugs: typed accumulating surface **catches** them
(TS2345 / TS2322), same as the non-accumulating typed stubs.

Freshness: healthy snapshot, probe `body.data.length` is green. Stale
GET (`items` instead of `data`) regenerates and the same probe is
TS2339 on `data`.

Scale (same overlay, fewer `.route` mounts; file count stays ~400):

| tree | methods | heap | dts |
| --- | ---: | ---: | ---: |
| `/health` only | 1 | **92 MB** | 145 B |
| public + entities | 5 | **93 MB** | 1.5 KB |
| full server | 18 | **146 MB** | 6.2 KB |

The 53 MB jump is the accumulated schema (documents / products /
session / dev), not more vendor files. One- and five-method trees sit
on the non-accumulating floor.

## Verdict

**Hypothesis split.** Snapshot emit **works**: a byproduct of the
cheap accumulating program is a standalone `api.d.ts` the SPA client
typechecks (css-only seed noise), and a return-shape change shows up
in the next emit. Heap **does not** stay in 92–130. Full-server
accumulation is **146 MB** local — over the 128 MB indicator, under
real Hono at 222. Non-accumulating typed Hono on the same server entry
is **93 MB** and already 0-diag.

Do not accumulate routes on the ordinary server check if that check
has to fit. Keep the 93 MB non-accumulating surface for checking
handlers, and emit the snapshot from a **separate pass** (this 146 MB
program, or per-module fragments at 92 MB — sibling note) rather than
as a byproduct of the fit-constrained check. The dedicated 215 MB
real-types snapshot worker is **not** required for generation; it
remains the fallback if a cheap accumulating pass fails a prod tail.

Handwritten overlays are still not the product.

## Does not imply

- Production fit at 93 or 146 MB.
- That `typeof api` against real Hono is cheap — it is still 222 here.
- That the union / client UI floor moved. This is a server-entry
  program plus a snapshot-backed client unit.
- That `$all` / wildcard auth routes belong in the snapshot — they
  were omitted so the emitted schema satisfies Hono's `Schema`
  constraint (`status: number` was the reject).

## Follow-ups

- Per-module fragment emit (fits locally at 92 MB):
  [`2026-08-13-snapshot-route-fragments.md`](2026-08-13-snapshot-route-fragments.md).
- Prod tail of today's union, then the 93 MB non-accumulating server
  unit, when Wrangler is authenticated.
- Decision-8 plan amendment: specialized check types + snapshot client
  edge, as **two check units**; snapshot regen is a separate pass or
  per-edited-module, not accumulation on the fit-constrained check.
