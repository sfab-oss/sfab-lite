# 2026-08-13 — Shallow RPC (contracts, not `typeof api`)

Non-authoritative (see [`README.md`](README.md)). Catalogue:
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).
Sibling: [`2026-08-13-zone-check-memory.md`](2026-08-13-zone-check-memory.md)
(generated `api.d.ts` / `hc<any>`).

**Status:** local done; **the client edge should not dump `typeof api`**;
**not a cap solution** for a UI route or the union.

**Hypothesis:** If the SPA talks to a handwritten fetch map typed from
`src/contract/` instead of `hc<ApiType>`, the client program drops the
server/drizzle graph. If the page stays ~145 MB, UI types are the floor.

## How to re-run

From the monorepo root, after `pnpm install` and
`pnpm --filter @sfab-lite/kernel install-universe`:

```bash
NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @sfab-lite/check measure:shallow-rpc
```

Harness: `apps/check/scripts/measure-shallow-rpc.ts`. Overlays `client.ts` and
the four hooks so they do not import `hono/client` or `ApiType`. Contract
schemas stay (`z.infer<typeof entityCreateSchema>`).

## What we ran

Host: Node 24, `--expose-gc`, 2026-08-13, worktree at `5d12a66` plus this
harness.

```
{"label":"union (today)","programRoots":72,"loadedFiles":1368,"honoFiles":22,"drizzleFiles":69,"loadedTextMb":5.82,"diagnostics":3,"ms":7150,"heapRetainedMb":339}
{"label":"union, shallow RPC","programRoots":72,"loadedFiles":1368,"honoFiles":22,"drizzleFiles":69,"loadedTextMb":5.82,"diagnostics":25,"ms":6159,"heapRetainedMb":327}
{"label":"entities hook, import closure (today)","programRoots":1,"loadedFiles":520,"honoFiles":22,"drizzleFiles":69,"loadedTextMb":4.66,"diagnostics":0,"ms":3194,"heapRetainedMb":222}
{"label":"entities hook, import closure, shallow RPC","programRoots":1,"loadedFiles":174,"honoFiles":0,"drizzleFiles":0,"loadedTextMb":3.19,"diagnostics":1,"ms":672,"heapRetainedMb":57}
{"label":"entities page, import closure (today)","programRoots":1,"loadedFiles":1347,"honoFiles":22,"drizzleFiles":69,"loadedTextMb":5.76,"diagnostics":0,"ms":4248,"heapRetainedMb":283}
{"label":"entities page, import closure, shallow RPC","programRoots":1,"loadedFiles":1213,"honoFiles":0,"drizzleFiles":0,"loadedTextMb":5.27,"diagnostics":0,"ms":1608,"heapRetainedMb":148}
{"label":"client entry, import closure (today)","programRoots":1,"loadedFiles":1366,"honoFiles":22,"drizzleFiles":69,"loadedTextMb":5.82,"diagnostics":1,"ms":1587,"heapRetainedMb":170}
{"label":"client entry, import closure, shallow RPC","programRoots":1,"loadedFiles":1232,"honoFiles":0,"drizzleFiles":0,"loadedTextMb":5.33,"diagnostics":1,"ms":1384,"heapRetainedMb":139}
```

| program | drizzle files | heap today | heap shallow |
| --- | ---: | ---: | ---: |
| union (72 roots) | 69 / 69 | 339 MB | 327 MB |
| entities **hook** | 69 → **0** | 222 MB | **57 MB** |
| entities **page** | 69 → **0** | 283 MB | **148 MB** |
| client **entry** | 69 → **0** | 170 MB | **139 MB** |

Hono `.d.ts` files go to 0 on hook/page/entry once `hono/client` is gone.
Union still seeds every server file, so drizzle stays (25 extra diagnostics
are the handwritten client's shape vs call sites — measurement overlay, not
a product).

## Verdict

**Severing `typeof api` is the client edge, and UI types are the floor.**
The hook fits locally (**57 MB**). The page (**148 MB**) and `main.tsx`
(**139 MB**) match the zone-check generated-`api.d.ts` result (~145 MB).
Independence (runtime type surface not derived from the template) already
required this cut; this run shows it is also the difference between a
222 MB hook and a 57 MB hook. It does not put a route that imports AppShell
under 128 MB, and it barely moves the union.

## Does not imply

- That we should check the union with a broken handwritten client (25 diags).
- That production OOMs at 148 MB.
- That two-widget + shallow was stacked (not run). Typed stubs + shallow
  on the union/page:
  [`2026-08-13-stack-typed-shallow.md`](2026-08-13-stack-typed-shallow.md).

## Follow-ups

- Client check units: seed from the hook/contract when those are what
  changed; do not seed from a page that imports the shell and expect a fit.
- Generated `api.d.ts` / handwritten route map are the same cut; pick one
  in the format RFC, do not keep `hc<typeof api>` as the check edge.
