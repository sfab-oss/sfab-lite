# ADR-0009: The registry reuses the shadcn item format, is served in the standard form, and locks the `@lite` namespace

**Status:** Accepted
**Date:** 2026-08-15
**Deciders:** Alwurts

## Context

Recipes — source copied into an app tree — are the primary extension
mechanism of the closed ecosystem ([ADR-0001](0001-edge-native-lite-architecture.md)).
They needed a data format, an address, and rules for what happens on
`add`. Inventing a format was rejected: the shadcn registry-item schema
already exists and agents already know it. But shadcn shipped three
unilateral schema releases in ten months, drifting toward carrying npm
and config — the opposite of a no-install ecosystem.

## Decision

- **Format:** the shadcn registry-item schema, **vendored and pinned**
  at one revision under `registry/`. Items carry a positive
  `meta.liteProfile` marker. Registry CI **fails closed**: unknown item
  types are rejected and the npm `dependencies` key must be *absent*,
  not merely empty.
- **Address:** the factory serves built items at `/r/{name}.json`
  (canonical `https://lite.sfab.dev/r/{name}.json` — survives
  extracting `registry/` into its own repo). Recipe versions are
  retained immutably; no auto-update, ever.
- **Namespace lock:** `components.json` is host-generated and configures
  `@lite` as the **only** registry, so `npx shadcn add @lite/button`
  works for local and ejected apps and foreign registries are
  unreachable by construction. Bare names are a hard error on hosted
  `add`.
- **`add` overwrites** target files — nothing is silent; every add
  ships through the PR loop and the diff is the review surface. No
  modified-since-add warnings. Provenance (`manifest.recipes`: version +
  per-file hash at copy time) records what came from where; it does not
  block.
- **Two agreement gates:** `check:registry-agreement` runs the real
  pinned `shadcn` CLI against the served registry and asserts placement
  equals `planAdd` and nothing extra was written; `check:manifest`
  asserts the starter is exactly the whole catalog assembled via `add`
  ("provenance is a gate, not a claim").

## Consequences

### Positive

- No CLI to write or maintain; agents and humans use the tool they know.
- Drift between "what the CLI does" and "what the host does" is a CI
  failure, not a support ticket.

### Negative

- shadcn schema changes are adopted on our schedule, by hand, or not at
  all.
- On a developer's own machine, stock-CLI bare names still reach the
  official registry (documented; hosted `add` refuses).

### Mitigations

- The vendored schema revision is a single pinned file; bumping it is a
  reviewed change with the agreement gate as the test.

## Implementation notes

The starter is assembled from the whole catalog by
`registry/scripts/assemble-erp-starter.mjs`; the memory cost of recipes
is gated as an absolute per-app ceiling measured in production, not per
recipe ([`../engineering/making-it-fit.md`](../engineering/making-it-fit.md),
"Recipes grow checked surface").

## Related

- [ADR-0008](0008-declarative-manifest-no-app-plugin-system.md)
- [`../architecture/APP-FORMAT.md`](../architecture/APP-FORMAT.md) §10.8 (recipe targeting)
- [`../../registry/README.md`](../../registry/README.md)
