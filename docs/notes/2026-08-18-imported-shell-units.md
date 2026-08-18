# 2026-08-18 — Imported-shell seed units

Non-authoritative (see [`README.md`](README.md)). Catalogue:
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).
Sibling: [`2026-08-18-full-catalog-assembled-check.md`](2026-08-18-full-catalog-assembled-check.md)
(53 unused catalog files onto the ten-recipe seed).

**Status:** local done; **imported layout recipes only**.
**Hypothesis:** growing `ERP_SEED_RECIPES` to the recipes the inset shell
actually imports (sidebar + transitives, dialog, alert-dialog, dropdown,
avatar, breadcrumb, badge) raises the client unit because those files
are `isClientAppPath` roots, but stays well below copying the unused
remainder of the 53-recipe catalog.

## How to re-run

From the monorepo root, after `pnpm install` and
`pnpm --filter @sfab-lite/kernel install-universe`:

```bash
NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @sfab-lite/check measure:units
```

Harness: `factory/check/scripts/measure-units.ts`. Product-path
server → emit → client `runCheck` on the packed ERP seed.

## What we ran

Host: Node, `--expose-gc`, 2026-08-18, worktree
`feat-erp-seed-recipe-list` on `feat/erp-starter-ui` after the inset-shell
rewire. Seed: 22 recipes (`ERP_SEED_RECIPES`).

```
{"label":"warm-matching-snapshot","diagnosticCount":0,"diagnostics":[],"units":[{"unit":"server","diagnosticCount":0,"checkMs":2356,"rootFileCount":84},{"unit":"emit","diagnosticCount":0,"checkMs":0,"rootFileCount":0,"skipped":true},{"unit":"client","diagnosticCount":0,"checkMs":4862,"rootFileCount":114}],"peaks":[{"unit":"server","checkMs":2356,"rootFileCount":84,"heapMb":251.3},{"unit":"client","checkMs":4862,"rootFileCount":114,"heapMb":385.9}],"checkMs":7218,"wallMs":8020,"rootFileCount":198,"emittedBytes":{},"serverTreeHash":"sha256:198d153bd5c27ff5cc89fb3c82e7cbe7a1cf3f4d22240d555bc8ec424a3484bb","heapBeforeMb":91.1,"heapAfterMb":100.1,"heapRetainedMb":9}
{"label":"cold-emit","diagnosticCount":0,"diagnostics":[],"units":[{"unit":"server","diagnosticCount":0,"checkMs":2103,"rootFileCount":84},{"unit":"emit","diagnosticCount":0,"checkMs":1756,"rootFileCount":62},{"unit":"client","diagnosticCount":0,"checkMs":4516,"rootFileCount":114}],"peaks":[{"unit":"server","checkMs":2103,"rootFileCount":84,"heapMb":254.1},{"unit":"emit","checkMs":1756,"rootFileCount":62,"heapMb":256.8},{"unit":"client","checkMs":4516,"rootFileCount":114,"heapMb":387}],"checkMs":8375,"wallMs":9545,"rootFileCount":260,"emittedBytes":{"src/generated/api.d.ts":3892,"src/generated/api.hash":2001},"serverTreeHash":"sha256:198d153bd5c27ff5cc89fb3c82e7cbe7a1cf3f4d22240d555bc8ec424a3484bb","heapBeforeMb":100.1,"heapAfterMb":100.7,"heapRetainedMb":1}
```

| assembly | server roots / heap | client roots / heap | diags |
| --- | ---: | ---: | ---: |
| ten-recipe seed (sibling note) | 84 / **255.2 MB** | 94 / **340.2 MB** | 0 |
| imported-shell seed (22 recipes) | 84 / **251.3 MB** | 114 / **385.9 MB** | 0 |
| ten + unused 53-catalog (sibling) | 84 / **257.6 MB** | 137 / **431.1 MB** | 0 |

Server roots stay at 84. Client roots **+20** vs the ten-recipe seed,
sampled heap **+45.7 MB**. The unused full catalog was **+43 roots /
+90.9 MB**. Both assemblies check clean.

## Verdict

**Seed the recipes the layout imports; keep the unused catalog add-only.**
The imported-shell delta is real and expected. It is not a license to
copy the remaining catalog onto every new app.

A live 128 MB isolate re-tail of this seed was not run. Local Node heap
is an indicator.

## Does not imply

- That +46 MB of local Node heap is +46 MB in the isolate.
- That the unused remainder of the catalog is now cheap to seed.

## Follow-ups

- Live re-tail only if someone proposes growing the default seed again.
