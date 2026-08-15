# 2026-08-13 — Eject copy-out

Non-authoritative (see [`README.md`](README.md)). Direction:
[ADR-0011](../decisions/0011-eject-rule.md) (was the 2026-08-12 direction note, graduated 2026-08-15)
item 8b / decision 9. Catalogue:
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).
Sibling: [`2026-08-13-zone-check-memory.md`](2026-08-13-zone-check-memory.md).

**Status:** local done; copy-out **is not real today**.

**Hypothesis:** A live app is the committed seed. Copy that tree out of the
host, `pnpm install && vite build`, and it builds with ordinary tools. If it
does, generated `package.json` / `tsconfig` must ship with the format or be
priced as an eject regression. If it fails, record what was actually missing
before the RFC claims eject.

## How to re-run

Unpack `packages/template/generated/seed.json` `sourceFiles` into a fresh
directory (not in git), then:

```bash
pnpm install
pnpm exec vite build   # or npx vite build if vite is not a project binary
```

A live factory app *is* that seed. Do not use `packages/template/` (parent
package.json has the real pins).

## What we ran

2026-08-13. Unpacked all 81 `sourceFiles` into packet-local
`active/lite-evolution/artifacts/eject-copy/` (not committed).

Top-level in the seed: `biome.json`, `components.json`, `package.json`,
`safelist.txt`, `tsconfig.json`, `vite.config.ts`, plus `src/` and
`migrations/`. **No `index.html`.**

Seeded `package.json`:

```json
{
  "name": "@sfab-lite/app",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "deploy": "wrangler deploy"
  }
}
```

No `dependencies`, no `devDependencies`. `pnpm install` is a no-op.

`npx vite build` failed loading `vite.config.ts`:

- `Cannot find package '@tailwindcss/vite'`
- unresolved `@vitejs/plugin-react`
- unresolved `vite`

Did not reach a missing-`index.html` error; that would be next. Did not try
`wrangler deploy` to a scratch account — the tree does not build.

## Verdict

**Eject copy-out is not real today.** Decision 9's generated `package.json` /
`tsconfig` with real exact pins are load-bearing, not polish. Also missing
from the seed and needed for a copied Vite app: `index.html`, and the Vite /
Tailwind / React plugin pins. Price any of those absent from the format as an
eject regression. The RFC must not claim eject.

## Does not imply

- That eject is impossible after generated pins exist — that is a later
  measurement, same protocol.
- Anything about check-worker memory (see the sibling note).

## Follow-ups

- App-format RFC lists generated pins + `index.html` as eject prerequisites.
- Re-run this note's commands the day those files exist; new dated file if
  the result changes, do not silently edit this verdict. **Re-run
  2026-08-15** with the generated files in place — the build step passes;
  see [`2026-08-15-pr9-image-generated.md`](2026-08-15-pr9-image-generated.md).
