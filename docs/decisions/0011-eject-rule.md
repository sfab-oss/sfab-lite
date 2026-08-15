# ADR-0011: The eject rule — the runtime may expose only real-package APIs or copyable source

**Status:** Accepted
**Date:** 2026-08-15
**Deciders:** Alwurts

## Context

A closed, no-install ecosystem is only acceptable if leaving it stays
possible. "Eject" here means: copy the app tree, pick an adapter, and
build with ordinary tools. In 2026-08-13 that was measured false — the
seeded `package.json` had no dependencies and there was no `index.html`
([`../engineering/making-it-fit.md`](../engineering/making-it-fit.md),
"Eject copy-out"). The risk was never the import list; it is base-runtime
*services* whose API exists only inside the host.

## Decision

The base runtime may expose only:

- (a) the API of a real, pinned npm package, or
- (b) framework source small enough to copy into an ejected app verbatim.

No capability may have an API that exists solely inside our host. The
generated `package.json` (exact runtime pins as `dependencies`, compiler
and standalone tooling as `devDependencies`), `tsconfig.json`,
`index.html` and `components.json` in every app tree carry what a copied
tree needs to `pnpm install && vite build`.

Eject is a **bound on lock-in, not a product feature** (owner,
2026-08-15): the rule is enforced by review and by the generated-files
gate; an eject-in-CI job is deliberately not built.

## Consequences

### Positive

- The lock-in surface is nameable: base-runtime services (auth, DB
  shape, routing) — and each of those is a real package today.
- Copy-out builds (re-run 2026-08-15 after #141).

### Negative

- Any host-only convenience API is off the table for the runtime, even
  when it would be simpler.

### Mitigations

- If a service ever needs a host-only API, it becomes a catalog module
  or an adapter method, with the eject cost stated in the ADR that adds
  it.

## Related

- [ADR-0006](0006-base-runtime-is-platform-resolved.md), [ADR-0008](0008-declarative-manifest-no-app-plugin-system.md)
- [`../architecture/APP-FORMAT.md`](../architecture/APP-FORMAT.md) §4
