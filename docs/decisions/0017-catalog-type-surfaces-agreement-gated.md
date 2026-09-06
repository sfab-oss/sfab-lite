# ADR-0017: Catalog type surfaces are agreement-gated; boundary files are checked against real types when the unit fits

**Status:** Accepted
**Date:** 2026-09-04
**Deciders:** Alwurts

## Context

[ADR-0016](0016-catalog-modules-r2-and-typed-stubs.md) shipped catalog
modules as R2 Loader ESM at serve and **cheap stubs** at check, after
overlaying pdf-lib's real `.d.ts` closure on the product server unit
killed the 128 MB isolate (P2: 19/50 `exceededMemory`). That check
fallback was a demo-shaped stub with no oracle. Pin2 then proved two
curated pins serve; it did not prove the stub is honest (`#177` bent
`save()` in a recipe body so hosted `Response` would pass).

The types-pack rule already exists for drizzle ([ADR-0010](0010-runtime-type-surface-independent-and-checked-in-units.md)):
a cheap surface is allowed only when CI agreement vs the real `.d.ts`
and planted errors hold. Catalog check is the same shape, not a new
one. A boundary-only program against real types ranks small locally
(both pins: 0 diagnostics, 191 files, 52 MB Node retained) but local
rank is not the isolate — P2's overlay was also "small" locally
(+7.7 MB) and still killed production.

## Decision

Catalog **check** types are a curated cheap `surface.d.ts`, agreement-gated
against the real package `.d.ts` on the recipe **boundary** files
(`check:catalog-agreement`). Seams have a why. Plants fire on both
sides (codes may differ). A miss against the overlay is `LITE-SURFACE`;
an import of the pin from outside the boundary is `LITE-RESOLVE`.

The hosted product check overlays the cheap surface on the **server**
unit (server → emit → client). When catalog boundary files exist
(`src/pdf/*.ts(x)`, `src/xlsx/*.ts(x)`), a fourth synchronous `modules`
unit overlays the committed real `.d.ts` vfs, then strips it. Overlaying
the real `.d.ts` on the product **server** unit stays rejected (P2:
19/50). Hosted E3 of the extra-unit shape is green (0/50
`exceededMemory` on control / pdf-lib / exceljs / both; 2026-09-06).

Catalog **serve** is unchanged: R2 Loader ESM, opt-in via `apps_add`,
closed allowlist ([ADR-0016](0016-catalog-modules-r2-and-typed-stubs.md)).

Placement (kernel vs catalog vs recipe vs refuse) is a separate gate
(`check:pin-placement`, APP-FORMAT §1). This ADR does not admit pins.

## Consequences

### Positive

- Stubs cannot drift from the real library without a CI red.
- Recipe bodies are not the place to paper over stub/real disagreement.
- The 128 MB isolate keeps the cheap overlay on the server unit. The
  extra `modules` unit is authorized by hosted E3 (0/50).

### Negative

- Agents that reach past the agreed L2 surface get `LITE-SURFACE` until
  the surface grows (republish, agreement, hosted probe).
- Apps with catalog helpers pay a fourth LanguageService construct.

### Mitigations

- Surface growth is a catalog republish with plants and
  `check:catalog-agreement`. Hosted `probe-catalog.mjs` is the
  publish-gate script; `--live` is ask-first.
- Real types stay off the server unit. The extra unit loads them from
  `@sfab-lite/core/catalog-real-vfs`, not the host barrel.

## Related

- [ADR-0010](0010-runtime-type-surface-independent-and-checked-in-units.md)
- [ADR-0016](0016-catalog-modules-r2-and-typed-stubs.md) (serve half stands)
- [`../architecture/APP-FORMAT.md`](../architecture/APP-FORMAT.md) §1, §5
- [`../engineering/making-it-fit.md`](../engineering/making-it-fit.md) §11
