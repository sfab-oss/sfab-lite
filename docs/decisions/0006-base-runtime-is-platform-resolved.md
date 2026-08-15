# ADR-0006: The base runtime is platform-resolved, versioned by line, and never vendored into apps

**Status:** Accepted
**Date:** 2026-08-15
**Deciders:** Alwurts

## Context

Every lite app checks, packs, and serves against a framework-owned
dependency universe (`framework/runtime` — the "frozen kernel" of
[ADR-0001](0001-edge-native-lite-architecture.md), trimmed by
[ADR-0004](0004-trim-unreachable-vendor-surface.md)). Two questions had
to be settled before the app format could be written: does an app carry
that universe, and how does an app name the version it was built
against?

The 128 MB isolate ceiling governs the first question
([`../engineering/making-it-fit.md`](../engineering/making-it-fit.md),
"The limits we actually run into"). Vendoring the runtime into each app
tree multiplies the per-app checked surface and turns every runtime fix
into a per-app source migration under the seed-is-a-snapshot rule
([`../architecture/OVERVIEW.md`](../architecture/OVERVIEW.md)).

## Decision

The manifest pins a runtime **line** (`"runtime": "^N"`); the image
records the resolved **exact** version. Apps never carry runtime bytes.
Each supported runtime version is a types-VFS + client-chunk set the
host carries.

Version policy, by plane:

- **Serve** carries old versions indefinitely — an old image keeps
  serving (the Cloudflare compat-date posture).
- **Develop** carries a small N of versions; N comes from measurement
  (each version is a bundle-size and memory cost), not policy. An app
  pinned below the window checks against the oldest carried version
  with a warning, never a hard fail (fall-forward).
- A runtime security fix is a re-resolve + re-pack; never a per-app
  manifest edit. Capability *removal* is a new runtime line with its own
  migration story, never a patch.

Cross-platform portability therefore means *same app code*, not *same
bytes*: eject tooling bundles the runtime at copy-out time
([ADR-0011](0011-eject-rule.md)).

## Consequences

### Positive

- Per-app checked surface stays bounded by the runtime, not multiplied
  by it.
- Runtime fixes reach every app on its next pack without touching app
  source.
- Image v0 can record provenance honestly: exact runtime + manifest
  snapshot ([`../architecture/APP-FORMAT.md`](../architecture/APP-FORMAT.md) §6).

### Negative

- Develop-plane N is a real ceiling: the types VFS is a ~10 MB bundle
  constant near the worker upload cap; carrying more than ~2 versions
  needs the VFS out of the bundle (deferred backlog).
- Fall-forward means an old app can see a warning it did not cause.

### Mitigations

- The window is measured before it is widened; VFS-out-of-bundle via R2
  is the named lever if N must exceed ~2.

## Implementation notes

Today's line is `^0` (`KERNEL_VERSION` 0.4.0). `AppBuild` carries
`runtime` (exact) and the manifest snapshot since the image PR (#141).
Legacy builds are read with `image: null` and rewritten by their next CD.

## Related

- [ADR-0001](0001-edge-native-lite-architecture.md), [ADR-0004](0004-trim-unreachable-vendor-surface.md)
- [ADR-0010](0010-runtime-type-surface-independent-and-checked-in-units.md)
- [`../architecture/APP-FORMAT.md`](../architecture/APP-FORMAT.md) §3 (manifest), §6 (image)
