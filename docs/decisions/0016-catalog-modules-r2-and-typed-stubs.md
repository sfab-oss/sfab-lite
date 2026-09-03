# ADR-0016: Catalog modules are R2-served Loader ESM with per-run typed stubs

**Status:** Accepted
**Date:** 2026-08-19
**Deciders:** Alwurts

## Context

Apps need opt-in npm libraries (first: `pdf-lib@1.17.1`) that are neither
the frozen kernel (everyone gets it) nor a recipe (editable copied
source). Three constraints collided:

1. **ADR-0006** — app builds never contain platform-resolved bytes;
   version retention wants old pins to keep serving.
2. **Check isolate (128 MB)** — overlaying pdf-lib's real `.d.ts`
   closure OOMed production `19/50` (`exceededMemory`, 4–5 s CPU).
   Local heap ranked that overlay as small (+7.7 MB). Local rank is not
   the isolate.
3. **Host upload cap** — embedding the 833 KiB ESM in the host Worker
   would ride the 10 MB gzip ceiling for every published version
   forever. Host was already ~47.6% after the drizzle-kit map moved
   in-bundle.

Probes: P0 (shadcn CLI accepts native `dependencies`; agreement must
pre-install), P2 (full types overlay kill → stubs), P3 (unpatched
Loader ESM, `compatibilityDate: "2026-07-23"` + `nodejs_compat`).

Alternatives weighed and rejected: bundle-at-pack (per-build cost, no
sharing); kernel variants (combinatorial); hosted full-slice overlay
(P2); embedding ESM in the host bundle (version-retention vs 10 MB).

## Decision

Catalog modules are a closed allowlist. One exact version per name per
runtime line. Enable only through `apps_add` of a recipe whose
`dependencies` lists a catalog pin (`lite/pdf-invoice` →
`pdf-lib@1.17.1`). `manifest.modules` is host-written, like `recipes`.

- **Runtime:** extra ESM in the app Worker Loader child, fetched from
  `KERNEL_R2` at `modules/<name>@<version>/`. Compile-time external.
  Missing R2 manifest is a named 409. No workerd patches for pdf-lib.
- **Check:** per-run overlay of **cheap stubs**, not the `.d.ts`
  closure. `runCheck` stays synchronous; stubs are stripped in
  `finally` so they cannot leak into the LanguageService store. Apps
  with `modules: []` pay zero. `import "pdf-lib"` is `LITE-RESOLVE`
  unless the stub is overlaid.
- **Store:** git is source of truth (`check:modules` regenerate-and-diff).
  CI uploads module objects next to kernel chunks (idempotent,
  manifest-written-last).
- **Registry:** `dependencies` is allowed iff every entry is
  `<name>@<exact-version>` on the catalog allowlist. Unknown npm names
  stay red. `check:registry-agreement` pre-installs catalog pins
  because the pinned shadcn CLI has no `--no-deps`.

## Consequences

### Positive

- Opt-in surface without growing every app's check heap.
- Old pins keep serving from R2 (ADR-0006 extended).
- Eject stays honest: generated `package.json` carries the exact pin.

### Negative

- Stubs type only the example (and what it needs), not pdf-lib's full
  API. Agents that reach past the stub get check errors until the stub
  grows.
- A hosted 50-shot stub overlay probe is a follow-up publish gate, not
  this PR.
- `HEAVY_SEED_RECIPES` excludes module-enabling recipes so the gallery
  snapshot does not import pdf-lib.

### Mitigations

- Stub growth is a catalog republish, gated by a hosted probe before
  overlaying anything larger than the cheap stubs.
- Loader child compat-date and `nodejs_compat` move together (P3
  gotcha: a date ≥ 2026-08-04 rejects the flag as redundant).

## Implementation notes

First pin: `pdf-lib@1.17.1`, server plane, runtime `^0`, 833 573 raw /
217 297 gzip, sha256 `9c49b40dcf473e44b1e438301702b2436d9273eef34a2abf1daa53abe5c652f5`.
Enable via `apps_add lite/pdf-invoice`. Helper lives at `src/pdf/invoice.ts`
because `src/lib/` is the client tree.

Second pin (planned next, landed 2026-09-02): `exceljs@4.4.0`, same
handling, default-export ESM (`reexportDefault`), enable via
`apps_add lite/xlsx-export`. Pin builders write artifacts only;
`assemble-catalog.mjs` unions them into `catalog-modules.json`.

## Related

- [ADR-0006](0006-base-runtime-is-platform-resolved.md)
- [`../architecture/APP-FORMAT.md`](../architecture/APP-FORMAT.md) §1, §3
- [`../engineering/making-it-fit.md`](../engineering/making-it-fit.md)
