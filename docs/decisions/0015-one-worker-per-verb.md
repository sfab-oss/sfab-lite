# ADR-0015: One worker per framework verb; the host is a composer

**Status:** Accepted
**Date:** 2026-08-16
**Deciders:** Alwurts

## Context

[ADR-0012](0012-framework-owns-the-verbs.md) moved `check`, `lint`, and
`build` into `framework/verbs`. Check and lint already ran in aux
workers (`factory/check`, `factory/lint`); build stayed in the host
because that is where CD, create, and workspace compile-on-save called
it.

Measured 2026-08-16 on main (`76bae79`): host upload **9.28 MiB gzip =
97.3%** of the conservative 10,000,000-byte Worker ceiling.
Composition: `esbuild-wasm` **3.68 MiB (38%)**, pulled in by
`@cloudflare/worker-bundler` through the build verb; server entry
3.50 MiB (36%); ~390 lazy chunks 2.45 MiB (25%, mostly shiki grammars
via `@pierre/diffs` — parked). Cloudflare counts every uploaded
module. Wasm cannot be fetched from R2 and compiled at runtime in
Workers, so the kernel-from-R2 trick (also used for drizzle-kit until
2026-08-19, when its map moved into the host bundle) does not apply. A host
that cannot deploy takes the app loop with it.

## Decision

**The host is a composer + console. Every framework verb runs in its
own aux worker.** Build joins check and lint as `factory/build`
(`sfab-lite-build`). The host reaches it over a service binding with
the same fetch + JSON + `X-Admin-Token` transport as check and lint.

[ADR-0012](0012-framework-owns-the-verbs.md) consequences are amended:
each verb runs in its own aux worker; the host composes.

## Consequences

### Positive

- Host upload drops by the wasm module (measured **9.28 → 5.47 MiB gzip**,
  97.3% → 57.3%). Build worker is **4.46 MiB gzip (46.7%)**.
- A Biome, TypeScript, or esbuild bump fails `check:bundle-size` on
  the worker that carries it, not at a production deploy.
- Four workers, one vocabulary: CD, create, and workspace compile
  still call the same verb functions; only the process boundary moved.

### Negative

- Four workers to deploy, four copies of `ADMIN_TOKEN`. A first
  deploy of `sfab-lite-build` 401s until the secret is set once.
- Compile latency pays a service-binding hop (same class as check /
  lint). One request per build; no chunking.
- Client kernel blobs used as compile-time key sets travel with the
  build worker as well as the host serve path — accepted duplication.

### Mitigations

- `check:bundle-size` hard-fails all four workers at ≥97% of
  10,000,000 bytes (warn at ≥85%). Conservative ceiling unchanged.
- CI deploys aux workers before the host so the binding target exists
  on first deploy.
- `/api/protected/health` reports build the same way as check and lint
  (`configured` / `reachable` / `matchesCaller` / `agree`).

## Alternatives weighed

- **Trim UI only** — shiki/grammar chunks are 2.45 MiB (25%) and
  parked. Even a complete grammar cut leaves esbuild-wasm at 38% and
  the host at ~6.8 MiB, still on the wrong side of the 97% fail line
  after the next modest bump. Does not move the wasm.
- **Govern only** — keep the host warn-only. The first signal would
  still be a failed prod deploy; that is the failure mode this
  decision exists to prevent.
- **Wasm from R2** — impossible on Workers: WebAssembly cannot be
  fetched and compiled at runtime the way old-version kernel JS
  chunks can (drizzle-kit used this path too until 2026-08-19; its
  map now ships in the host bundle).

## Related

- [ADR-0012](0012-framework-owns-the-verbs.md),
  [ADR-0007](0007-harness-depends-on-framework-never-the-reverse.md)
- [`../engineering/making-it-fit.md`](../engineering/making-it-fit.md)
  technique 9
- [`../engineering/DEPLOY.md`](../engineering/DEPLOY.md)
