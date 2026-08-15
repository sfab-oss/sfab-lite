# 2026-08-14 — PR 8 starter rebuild check

Non-authoritative (see [`README.md`](README.md)). Catalogue:
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).

**Status:** local done; **live re-tail owner-gated** (prepare only).
**What changed:** the ERP starter now lives on the RFC §2 tree and
imports the seven published recipes. Unused sidebar/widget UI is gone.
`isClientAppPath` classifies RFC client dirs plus `src/router.tsx` and
`src/styles.css`, so `src/hono/` / `src/db/` / `src/auth/` stay server.
Review fixup: balance logic lives once in `src/db/balances.ts`;
`check:manifest` fails when the starter drifts from the catalog
assembly (tree or provenance).

## How to re-run

```bash
NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @sfab-lite/check measure:units
NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @sfab-lite/check measure:assembled-recipes
```

## What we ran

Host: Node 24, `--expose-gc`, 2026-08-14, worktree
`lite-evolution-pr8-starter-rebuild`.

`measure:units` (warm matching snapshot, then cold emit):

```
{"label":"warm-matching-snapshot","peaks":[{"unit":"server","rootFileCount":83,"heapMb":243.2},{"unit":"client","rootFileCount":90,"heapMb":318.6}]}
{"label":"cold-emit","peaks":[{"unit":"server","rootFileCount":83,"heapMb":245.3},{"unit":"emit","rootFileCount":62,"heapMb":248.4},{"unit":"client","rootFileCount":90,"heapMb":319.8}]}
```

`measure:assembled-recipes` (starter already assembled; re-add is a no-op):

```
{"label":"starter","peaks":[{"unit":"server","rootFileCount":83,"heapMb":243.4},{"unit":"client","rootFileCount":90,"heapMb":318.7}],"fileCount":54}
{"label":"starter-plus-recipes","peaks":[{"unit":"server","rootFileCount":83,"heapMb":245.5},{"unit":"client","rootFileCount":90,"heapMb":319.0}],"fileCount":55}
```

| path | server roots / heap | client roots / heap | diags |
| --- | ---: | ---: | ---: |
| PR 7 starter (unused RFC copies) | 87 / **244.6 MB** | 107 / **371.5 MB** | 0 |
| PR 8 rebuilt starter | 83 / **243.2 MB** | 90 / **318.6 MB** | 0 |

Client heap dropped because the seed no longer carries sidebar / dropdown
/ avatar / sheet. The seven recipes are imported and still cheaper than
that tree. Server roots fell (no products/documents). Re-adding the
catalog does not grow roots.

Live re-tail: same protocol as
[`2026-08-14-units-retail.md`](2026-08-14-units-retail.md). Do not run
live creates without owner go.
