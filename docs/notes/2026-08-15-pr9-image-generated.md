# 2026-08-15 — PR 9a: image v0 + generated format files

Non-authoritative (see [`README.md`](README.md)). Direction:
[`2026-08-12-lite-evolution-direction.md`](2026-08-12-lite-evolution-direction.md)
rollout 9. RFC:
[`../architecture/APP-FORMAT.md`](../architecture/APP-FORMAT.md).

**Status:** local done; live re-tail owner-gated (prepare only).

## What changed

One generator in `framework/toolchain` (`generateFormatFiles`) emits
`package.json`, `tsconfig.json`, `index.html`, and `components.json`.
The starter commits that output. `pnpm check:generated` fails if the
bytes drift. The host regenerates the four files on create, on `add`,
and when a tree is materialised for CD (not on every serve). Agent
writes to those paths and to `src/generated/**` are refused;
`writeGenerated` is the host bypass so check emit can still persist
`api.d.ts` / `api.hash`.

`AppBuild` is the image. New writes must carry `image: 0`, the resolved
exact runtime (`KERNEL_VERSION`, stored as `runtime` — not a second
copy of `kernelVersion`), a snapshot of `manifest.json` at pack, the
server/client asset keys, and migration file names. `manifest.recipes`
inside that snapshot is the provenance record. `getBuild` fills
`image: null` on legacy records so existing live apps keep serving; the
next CD writes an image. No backfill, no prod reads.

Carry-overs: `serverImportClosure` now follows bare `import "./x"`
side-effect imports; `check:registry-agreement` fails if the CLI writes
anything extra beyond `planAdd`.

## How to regenerate

```sh
pnpm --filter @sfab-lite/template generate
pnpm --filter @sfab-lite/template bake-seed
```

## Legacy-build decision

Reads tolerate a missing `image` field (`image: null`, `runtime` from
the old `kernelVersion`). Writes refuse an image-less record. Live apps
keep serving until their next CD.

## Heap

Generated files sit at the tree root, outside the check units.
`src/generated` was already a unit member. Server/client root sets did
not change in 9a — no local heap re-measure.

## Re-tail

Owner-gated (prepare only).
