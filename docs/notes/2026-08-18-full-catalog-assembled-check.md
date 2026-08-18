# 2026-08-18 — Full-catalog assembled check

Non-authoritative (see [`README.md`](README.md)). Catalogue:
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).
Sibling: [`2026-08-14-assembled-recipes-check.md`](2026-08-14-assembled-recipes-check.md)
(seven recipes, unused RFC copies);
[`2026-08-14-pr8-starter-rebuild-check.md`](2026-08-14-pr8-starter-rebuild-check.md)
(ERP already assembled from the then-catalog).

**Status:** local done; **do not grow `ERP_SEED_RECIPES`**.
**Hypothesis:** copying every published Base UI recipe onto the ERP seed
grows the client unit because `src/components/ui/*` is a client root,
even when the app does not import those files. That is the unused-
sidebar class of check cost, not a no-op re-add.

## How to re-run

From the monorepo root, after `pnpm install` and
`pnpm --filter @sfab-lite/kernel install-universe`:

```bash
NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @sfab-lite/check measure:assembled-recipes
```

Harness: `factory/check/scripts/measure-assembled-recipes.ts`. Applies
every catalog name via `planAdd` onto a copy of the template seed, then
runs the product units check (`forceCold`) on starter vs
starter-plus-recipes.

## What we ran

Host: Node, `--expose-gc`, 2026-08-18, worktree
`feat-erp-seed-recipe-list` (`8ca4bfe`). Catalog: 53 recipes. Seed:
original ten. Local `tsc -p tsconfig.app.json` with the extra files
copied into `starters/erp/app` already passed (copies not committed).

```
{"label":"starter","diagnosticCount":0,"diagnostics":[],"units":[{"unit":"server","diagnosticCount":0,"checkMs":2354,"rootFileCount":84},{"unit":"emit","diagnosticCount":0,"checkMs":0,"rootFileCount":0,"skipped":true},{"unit":"client","diagnosticCount":0,"checkMs":3671,"rootFileCount":94}],"peaks":[{"unit":"server","checkMs":2354,"rootFileCount":84,"heapMb":255.2},{"unit":"client","checkMs":3671,"rootFileCount":94,"heapMb":340.2}],"checkMs":6025,"wallMs":6763,"rootFileCount":178,"fileCount":60,"heapBeforeMb":94.9,"heapAfterMb":103.7}
{"label":"starter-plus-recipes","diagnosticCount":0,"diagnostics":[],"units":[{"unit":"server","diagnosticCount":0,"checkMs":2063,"rootFileCount":84},{"unit":"emit","diagnosticCount":0,"checkMs":0,"rootFileCount":0,"skipped":true},{"unit":"client","diagnosticCount":0,"checkMs":5477,"rootFileCount":137}],"peaks":[{"unit":"server","checkMs":2063,"rootFileCount":84,"heapMb":257.6},{"unit":"client","checkMs":5477,"rootFileCount":137,"heapMb":431.1}],"checkMs":7540,"wallMs":8354,"rootFileCount":221,"fileCount":103,"heapBeforeMb":103.8,"heapAfterMb":104.4}
```

| assembly | files | server roots / heap | client roots / heap | diags |
| --- | ---: | ---: | ---: | ---: |
| starter (ten seed recipes) | 60 | 84 / **255.2 MB** | 94 / **340.2 MB** | 0 |
| starter + 53 catalog recipes | 103 | 84 / **257.6 MB** | 137 / **431.1 MB** | 0 |

Server roots stay at 84: extra files land under `src/components/ui/`
and `src/hooks/`, which `isClientAppPath` classifies as client. Client
roots +43, sampled heap **+90.9 MB** while the LanguageService is live.
Both assemblies check clean.

## Verdict

**Keep `ERP_SEED_RECIPES` at the original ten.** The extra recipes are
add-only. Baking the full catalog would put unused Base UI surfaces on
every new app's client unit — the same reason PR 8 dropped unused
sidebar/widget UI. Apps that need dialog, sidebar, toast, etc. `add`
them.

A live 128 MB isolate re-tail of a full-catalog seed was not run. Local
Node heap is an indicator; prior pairs do not map 1:1 onto isolate OOM.
The direction of the delta still matches the unused-client-tree failure
mode, so the seed does not grow until a live full-catalog app is
measured and survives.

## Does not imply

- That +91 MB of local Node heap is +91 MB in the isolate.
- That `apps_add` of one extra recipe is unsafe. This row is *all* unused
  catalog files at once.
- A pass/fail ceiling for `check:registry`. The catalog can stay at 53.

## Follow-ups

- Live re-tail only if someone proposes growing the default seed.
- `apps_add @lite/sidebar` on a throwaway app after this PR merges.
