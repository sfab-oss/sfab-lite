# ADR-0008: Apps are configured by a declarative manifest; there is no app-level plugin system

**Status:** Accepted
**Date:** 2026-08-15
**Deciders:** Alwurts

## Context

The app format needed a place for per-app configuration: entries,
runtime line, adapter target, capabilities, recipe provenance. The
obvious shapes were an executable config file (`lite.config.ts`) with
build/serve hooks, or a data-only descriptor.

A plugin API is an arbitrary-code extension point in exactly the place
the closed ecosystem exists to protect ([ADR-0001](0001-edge-native-lite-architecture.md)),
and it can never be removed once agents depend on it.

## Decision

Apps carry a typed, data-only `manifest.json` (format v0, schema and
validation in `framework/toolchain`, gate `check:manifest`). No
executable config file, no build/serve hook API.

Flexibility lives in the two sanctioned places:

- **Adapters** — plugin-*shaped* interface, but framework-owned and
  platform-level ([`../architecture/APP-FORMAT.md`](../architecture/APP-FORMAT.md) §6).
- **Recipes** — source in the tree, where agents may edit anything
  ([ADR-0009](0009-registry-shadcn-format-served-lite-namespace.md)).

If a real hook need emerges, a narrow named hook is added to the
manifest — cheap in that direction, impossible in reverse.
External-service needs (invoicing, messaging, payments) have a declared
home: the manifest's `capabilities` array, so product pressure lands in
a versioned slot, not in accreted hooks.

This composes with [ADR-0005](0005-app-loop-mimics-an-ordinary-repo.md):
where the platform *can* conform we keep the ordinary shape — the tree
carries a real, host-generated, drift-gated `package.json`,
`tsconfig.json`, `index.html`, `components.json`; drizzle-style
migrations; a familiar layout. The manifest is additional, not a
replacement for the ordinary files. Deviations are confined to what the
platform genuinely forces: the closed import surface and the absent
install step.

## Consequences

### Positive

- The manifest can be validated, diffed, snapshotted into an image, and
  regenerated from — none of which an executable config allows.
- Agents see an ordinary repo plus one small JSON file.

### Negative

- Anything not expressible as data waits for a named hook or an adapter
  change; there is no escape hatch by design.

### Mitigations

- `capabilities` and `modules` are the versioned slots for growth;
  `check:manifest` fails closed on unknown fields.

## Implementation notes

Generated members are host-authoritative and agent-readonly
(`platform-readonly.ts`); the host regenerates them on create, `add`,
and CD materialise, and `check:generated` holds the starter's committed
copies to the generator (#141).

## Related

- [ADR-0005](0005-app-loop-mimics-an-ordinary-repo.md)
- [`../architecture/APP-FORMAT.md`](../architecture/APP-FORMAT.md) §2–§4
