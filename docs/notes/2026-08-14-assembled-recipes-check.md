# 2026-08-14 — Assembled recipes check (first recipes)

Non-authoritative (see [`README.md`](README.md)). Catalogue:
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).

**Status:** local done; **production gate deferred**.
**Hypothesis:** copying every published recipe onto the starter at the
RFC §2 targets (`src/components/ui/`, `src/lib/`) grows the checked
surface enough to matter, even before PR 8 rebuilds the starter to
import those files.

## How to re-run

From the monorepo root, after `pnpm install` and
`pnpm --filter @sfab-lite/kernel install-universe`:

```bash
NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @sfab-lite/check measure:assembled-recipes
```

Harness: `factory/check/scripts/measure-assembled-recipes.ts`. Applies
every catalog name via `planAdd` onto a copy of the template seed,
then runs the product units check (`forceCold`) on starter vs
starter-plus-recipes.

## What we ran

Host: Node 24, `--expose-gc`, 2026-08-14, worktree
`lite-evolution-pr7-registry` (parent `2640e10`).

```
{"label":"starter","diagnosticCount":0,"diagnostics":[],"units":[{"unit":"server","diagnosticCount":0,"checkMs":2631,"rootFileCount":87},{"unit":"emit","diagnosticCount":0,"checkMs":0,"rootFileCount":0,"skipped":true},{"unit":"client","diagnosticCount":0,"checkMs":4973,"rootFileCount":107}],"peaks":[{"unit":"server","checkMs":2631,"rootFileCount":87,"heapMb":244.6},{"unit":"client","checkMs":4973,"rootFileCount":107,"heapMb":371.5}],"checkMs":7604,"wallMs":8708,"rootFileCount":194,"fileCount":75,"heapBeforeMb":89,"heapAfterMb":97.9}
{"label":"starter-plus-recipes","diagnosticCount":0,"diagnostics":[],"units":[{"unit":"server","diagnosticCount":0,"checkMs":2664,"rootFileCount":94},{"unit":"emit","diagnosticCount":0,"checkMs":0,"rootFileCount":0,"skipped":true},{"unit":"client","diagnosticCount":0,"checkMs":4454,"rootFileCount":107}],"peaks":[{"unit":"server","checkMs":2664,"rootFileCount":94,"heapMb":263},{"unit":"client","checkMs":4454,"rootFileCount":107,"heapMb":371.8}],"checkMs":7118,"wallMs":8127,"rootFileCount":201,"fileCount":83,"heapBeforeMb":97.9,"heapAfterMb":98.4}
```

| assembly | files | server roots / heap | client roots / heap | diags |
| --- | ---: | ---: | ---: | ---: |
| starter | 75 | 87 / **244.6 MB** | 107 / **371.5 MB** | 0 |
| starter + 7 recipes | 83 | 94 / **263.0 MB** | 107 / **371.8 MB** | 0 |

Recipes land at RFC paths the current starter does not import
(`src/ui/*` still). The server unit roots every non-client `src/`
file, so the seven extra files show up there (+7 roots, **+18.4 MB**
sampled while LS live). The client unit stays on `src/ui/`, so its
graph and heap are unchanged. Both assemblies check clean.

## Verdict

**Recorded, not gated.** First recipes add a measurable server-unit
bump and no client bump, because they are unused RFC-path copies.
The production ceiling stays the units 0/8 re-tail
([`2026-08-14-units-retail.md`](2026-08-14-units-retail.md)). The next
live re-tail is PR 8, when the starter is rebuilt to import these
files. A production assembled-app gate needs a live app that actually
uses the recipes; building one here would leak into PR 8.

## Does not imply

- That +18 MB of local Node heap maps onto isolate OOM. Every prior
  local/prod pair says it does not.
- That PR 8's rebuilt starter will look like this row. Once
  `src/components/ui/*` is imported from client routes, those files
  enter the client unit — that is the number to measure then.
- A pass/fail ceiling for `check:registry`. This harness is
  delete-on-graduation; do not promote it to CI until there is a
  live assembled app and a stated absolute cap.

## Follow-ups

- PR 8: re-run this harness (or a live re-tail) after the starter
  imports the recipes.
- Owner ratification: recipe targeting draft in `registry/README.md`
  (schema source under `src/db/`; never `migrations/`).
