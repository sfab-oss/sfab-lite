# ADR-0004: Trim unreachable capability out of the frozen kernel's vendored surface

**Status:** Accepted
**Date:** 2026-07-25
**Deciders:** Alwurts

## Context

The frozen kernel decides what a sub-app can do. `CLIENT_IMPORT_MAP` /
`SERVER_IMPORT_MAP` are the complete list of specifiers a sub-app may import,
and `resolve-modules.ts` already refuses anything outside that set (the
import-map resolution gate). Sub-apps run on D1 and nothing else.

That makes a category of weight **dead by construction**: vendored surface for
capability the kernel does not serve. A sub-app cannot reach it, no matter what
its owner writes. It is not dormant, or advanced, or for-later — it is
unreachable.

We were paying for it in the worst place. `sfab-lite-check` was dying with
`exceededMemory` on **36%** of `/check` calls. The cause was drizzle's
`column-builder.d.ts`, which declares three type aliases that dispatch on a
`TDialect` type parameter and name a column class per dialect in each
conditional branch. A D1 app is always `TDialect = 'sqlite'`, so the other
branches never instantiate — but TypeScript still loads and binds all four
dialect modules to **resolve** the references sitting inside branches it will
never take. That was 232 of 877 loaded source files, 67 MB of the 330 MB a
program retained against a 128 MB isolate.

Trimming those branches took the program to 645 files / 263 MB and the
production OOM rate to **0 of 64 creates**. Full evidence, including five
approaches measured and rejected:
[`../notes/2026-07-25-check-worker-memory.md`](../notes/2026-07-25-check-worker-memory.md).

The decision here is not about drizzle. It is whether that was a one-off
rescue or a technique we apply deliberately, since the same shape is visible
elsewhere in the stack.

## Decision

**Vendored surface for capability the frozen kernel does not serve is treated
as dead weight and removed** — from the types VFS, the runtime vendor bundles,
or both — rather than carried.

A trim is legitimate only when all three hold:

1. **Unreachable, not merely unused.** The kernel does not serve it, so no
   sub-app can reach it at runtime. "No app happens to use it yet" is not
   sufficient — that is a bet on the future, and this rule is not.
2. **Asserted at build time.** The trim fails the build loudly if the upstream
   package changes shape, and a second assertion checks the **finished
   artifact**, not just the code path that produced it.
3. **Proven by the check gate.** The seed template still typechecks clean, and
   the saving is measured rather than reasoned about.

Removals are recorded in the types-VFS manifest (`prune.trim`) so the artifact
states what was cut.

This is an architecture-specific licence. It is legitimate here **because** the
kernel is frozen and the import maps are closed; it would not be legitimate in
an ordinary application, where a dependency's full API is genuinely reachable.

## Consequences

### Positive

- The check worker fits its isolate with headroom, and the whole class of
  intermittent `exceededMemory` failures is gone.
- Smaller types VFS (2,043 → 1,811 files, 9.34 → 8.64 MB) and a smaller upload.
- Capability the platform never had stops being advertised to the checker, so a
  sub-app that tries `pgTable` now fails the check with a clear resolution
  error instead of typechecking and then failing at runtime.

### Negative

- **Couples us to upstream file shape.** `trim-drizzle-dialects.mjs` matches
  specific lines in a specific file. A drizzle bump can break it.
- **Narrows what a sub-app can express**, deliberately. Supporting a second
  database later means undoing a trim, not just adding a binding.
- Every trim is a place where our vendored types differ from what a developer
  sees in their own editor against the real package.

### Mitigations

- The build fails loudly on shape change — condition 2 is the whole answer to
  the coupling risk, and it is why "assert, don't hope" is a hard requirement
  rather than a nicety. Re-derive a broken trim; **do not delete the gate.**
- Trims are individually small and individually reversible. Deleting the trim
  module and rebuilding restores full surface.

## Implementation notes

`packages/kernel/scripts/trim-drizzle-dialects.mjs` is the reference
implementation and the shape to copy. Two properties are worth preserving:

- It runs as a **read filter during the types-VFS closure build**, not as a
  patch to `node_modules`. The same text feeds both the program's module
  resolution and what gets baked into the VFS, so the two cannot disagree, and
  `pnpm install` stays idempotent.
- `assertNoDeadDialects()` checks the finished VFS rather than trusting the
  filter, because the VFS is topped up from disk afterwards
  (`ensureDualDeclSiblings` — and `column-builder.d.cts` sits right next to the
  file being rewritten).

### Candidates to evaluate, with what is already known

Not commitments. Each needs its own measurement before anyone acts.

**`better-auth` plugin barrel — the strongest candidate.** The template imports
`better-auth/plugins` and uses exactly one plugin, `organization`. The barrel
pulls in SIWE, passkey, two-factor, phone-number, OIDC provider, one-tap,
device-authorization, magic-link and more. Measured on the type side: deep
importing `better-auth/plugins/organization` drops 157 → 141 files, worth only
**2 MB of heap** — not worth it for the check worker alone. But the *runtime*
vendor bundle `better-auth.js` is **2.1 MB** and lands in `apps/factory`,
currently 5.48 MiB gzip / 57.5% of the 10 MB Worker limit. That saving is
unmeasured and is the number to get. Note this trim also needs a kernel
import-map and vendor-entry change, because `resolve-modules.ts` refuses
specifiers the kernel does not serve.

(`apps/lint` is the app actually near the ceiling, at 9.09 MiB / 95.4% — but
its weight is the Biome WASM binary, unrelated to vendored app dependencies and
not addressable by this technique.)

**`kysely` — 265 type files in the VFS, zero ever opened** by the template
program. It arrives as a drizzle peer. Pure upload weight, no heap cost, so it
is a bundle-size question only.

**`@base-ui/react` — 800 files in the VFS, 22 loaded.** Deliberately exempt:
the client kernel vendors the full surface, so the VFS must advertise the same
vocabulary or an app importing e.g. `dialog` fails the check. **Not a
candidate** unless the vendoring strategy changes — the exemption is load
bearing and documented in `prebuild-types-vfs.mjs`.

Note the general lesson from the rejected attempts: **text size does not
predict heap.** `lib.dom.d.ts` is 40% of all loaded text but only ~10% of
retained heap, because declaration-heavy `.d.ts` parses far cheaper per byte
than generic-heavy library types. Measure heap, not bytes, when the target is
the check worker; measure bytes when the target is the upload limit.

## Related

- [ADR-0001](0001-edge-native-lite-architecture.md) — the frozen-kernel
  architecture this licence depends on.
- [`../notes/2026-07-25-check-worker-memory.md`](../notes/2026-07-25-check-worker-memory.md)
  — the incident, the measurements, and the five rejected alternatives.
- [`../architecture/OVERVIEW.md`](../architecture/OVERVIEW.md) — import maps and
  the resolution gate.
