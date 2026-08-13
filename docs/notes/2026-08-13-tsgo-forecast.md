# 2026-08-13 — tsgo / TypeScript 7 forecast

Non-authoritative (see [`README.md`](README.md)). Catalogue:
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).
Pin stays **TypeScript 6.0.3**.

**Status:** local forecast done; **cannot ship**; advertised ~2.9× memory
**did not reproduce** as process RSS on this tree.

**Hypothesis:** `tsgo` (TypeScript native preview) on the same VFS+seed tree
uses ~2.9× less memory than `tsc --noEmit`, so the day the pin can move the
check-cap problem mostly dissolves.

## How to re-run

From the monorepo root, after `pnpm install` and
`pnpm --filter @sfab-lite/kernel install-universe`:

```bash
NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @sfab-lite/check measure:tsgo
```

Harness: `apps/check/scripts/measure-tsgo.ts`. Materializes `TYPES_VFS` + seed
under `apps/check/.tmp/tsgo-forecast/` (gitignored) with `noLib` / bundler
resolution matching the check worker's compiler options as closely as a disk
`tsc` can. Installs `@typescript/native-preview` into
`apps/check/.tmp/tsgo-pkg/` (also gitignored) — **not** into the repo pin.
Memory is `/usr/bin/time -v` maximum RSS, not LanguageService `heapUsed`.

## What we ran

Host: Node 24, 2026-08-13, worktree at `5d12a66` plus this harness.
`tsc` 6.0.3 from the universe. `tsgo` **7.0.0-dev.20260707.2**.
2,498 VFS files materialized.

```
{"label":"materialized","vfsFiles":2498,"outRoot":".../apps/check/.tmp/tsgo-forecast"}
{"label":"tsc 6.0.3 --noEmit","status":2,"ms":4937,"maxRssMb":523,"userSec":8.15}
{"label":"tsgo --noEmit","status":1,"ms":1041,"maxRssMb":459,"userSec":3.26}
{"label":"ratio tsc/tsgo RSS","tscMaxRssMb":523,"tsgoMaxRssMb":459,"ratio":1.14}
```

Both compilers reported the **same 26 diagnostics** (disk resolution is not
the check worker's `PACKAGE_ENTRY` map: `drizzleAdapter` export, `QueryClient`,
`vite.config.ts` missing types, implicit `any` on some callbacks). They did
run the program; this is not an early bail.

| | wall | user CPU | max RSS |
| --- | ---: | ---: | ---: |
| tsc 6.0.3 | 4.9 s | 8.2 s | **523 MB** |
| tsgo 7 preview | 1.0 s | 3.3 s | **459 MB** |
| ratio | ~4.7× time | ~2.5× time | **1.14× RSS** |

## Verdict

**Forecast only; do not move the pin on this number.** On this tree, tsgo is
clearly faster and only **14% leaner in process RSS**. That is not the
catalogue's ~2.9× memory figure (Microsoft `--noEmit` heap, a different
metric and program). RSS here also is not the check worker's 340 MB
`heapUsed`. Keep tsgo as an external event: re-measure LanguageService-shaped
heap the day 6.0.3 can move. Do not budget the isolate on 340/2.9.

## Does not imply

- That tsgo is useless — time ~2.5–4.7× is real on this run.
- That the check worker would see 1.14× — different host, different metric.
- That we should install `@typescript/native-preview` in the workspace.

## Follow-ups

- Re-run against a LanguageService-equivalent host when a tsgo JS API can
  replace `typescript` 6.0.3 in `apps/check`.
- Until then the 6.0.3 pin stands.
