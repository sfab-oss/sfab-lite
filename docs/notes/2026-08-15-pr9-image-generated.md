# 2026-08-15 — PR 9a: image v0 + generated format files

Non-authoritative (see [`README.md`](README.md)). Direction:
[`2026-08-15-milestone-1-closeout.md`](2026-08-15-milestone-1-closeout.md) (was the 2026-08-12 direction note, graduated 2026-08-15)
rollout 9. RFC:
[`../architecture/APP-FORMAT.md`](../architecture/APP-FORMAT.md).

**Status:** local done; live re-tail owner-gated (prepare only).

## What changed

One generator in `framework/toolchain` (`generateFormatFiles`) emits
`package.json`, `tsconfig.json`, `index.html`, and `components.json`.
`package.json` splits the runtime-served packages (`dependencies`) from
the compiler, CSS build, type packages and standalone Vite tooling
(`devDependencies`); both lists come from one export, `FORMAT_PINS` in
the runtime's `pins.mjs`, and `check:workspace` holds the starter's
own `package.json` to the same versions. The starter commits that
output. `pnpm check:generated` fails if the
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

## Eject copy-out — re-run of the 2026-08-13 protocol

Same commands as
[`2026-08-13-eject-copy-out.md`](2026-08-13-eject-copy-out.md) on the
committed `starters/erp/app` tree at this PR (copy out, `pnpm install
--ignore-workspace`, `vite build`), 2026-08-15, this host:

- `pnpm install` resolved every pin; pnpm 11 stopped at its
  build-scripts approval prompt for `esbuild` / `@tailwindcss/oxide`
  (pnpm policy, not a missing package).
- `vite build`: 350 modules, `dist/index.html` + one CSS + one JS
  chunk, ~2.4 s.

**Copy-out builds.** That flips the 2026-08-13 verdict for the *build*
step. Not measured: `wrangler deploy` of the copied tree (no
`wrangler.jsonc` in the app tree — the standalone loop uses the
`starters/erp` package for that), and running the copied app against
a database. Eject-in-CI stays in the deferred backlog.

## Re-tail

Owner-gated (prepare only).
