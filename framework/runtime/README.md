# `@sfab-lite/kernel`

Frozen dependency universe for factory-built apps: server LOADER chunks,
client import-map chunks, types VFS (check worker), and CSS VFS (Tailwind
compile).

```sh
pnpm --filter @sfab-lite/kernel build
```

Regenerates `vendor/`, `kernel.json`, and `src/generated/*` from the pinned
inputs. Wall-clock timestamps are not written into committed artifacts.

## Isolation (what “frozen” actually means)

Prebuild does **not** read the monorepo workspace `node_modules`. It installs
and resolves from `framework/runtime/universe/` — a nested mini-workspace with
its own `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml`. Install
runs with `cwd=universe` so pnpm never joins the monorepo workspace and
cannot re-resolve optional peers from `factory/` / other packages.

Guarantees:

1. **Reproducibility given the universe lockfile** — same
   `universe/package.json` + `universe/pnpm-lock.yaml` → byte-identical
   artifacts on rebuild.
2. **Workspace isolation** — adding or removing an unrelated workspace
   package (and its peers) must not change any kernel artifact byte.
3. **Drift detection** — `pnpm check:kernel` rebuilds and fails if the
   rebuild output differs from the **git index** for `vendor/`,
   `kernel.json`, or `src/generated/*`. CI job `kernel` enforces the same.

Two consecutive builds in one worktree only prove determinism for a fixed
install graph. Isolation + the drift gate are what make the universe frozen
across monorepo churn.

Shared app pins (react, hono, zod, …) are **owned by this package** in
`scripts/pins.mjs`. The starter (`starters/erp/package.json`) must match
those versions (`check:workspace`); a starter edit cannot change the
runtime universe (`check:pins`). `universe/package.json` must list the
same versions (validated by `scripts/ensure-universe.mjs`). Client extras
(`clsx`, `@types/react`, …) live in `UNIVERSE_EXTRA_PINS`.

## `@cloudflare/workers-types` — out of the frozen universe

**Decision: do not install or bake `@cloudflare/workers-types`.**

Factory-built apps run server code on Workers, but they are typechecked
against the small hand-written surface in
`@sfab-lite/core`'s `cloudflare-ambient.d.ts` (baked into the types VFS as
`/types/cloudflare-ambient.d.ts`). The template's `tsconfig.app.json`
deliberately omits `@cloudflare/workers-types` for the same reason: the full
Workers types would green-light APIs the factory ambient does not provide.

`drizzle-orm` / `better-auth` list `@cloudflare/workers-types` as an
*optional* peer. When another workspace package (e.g. `factory/lint`) provides
that peer, a workspace-hoisted install re-resolves those packages and
silently changes vendor chunks and the types VFS. The isolated universe
never declares the peer, so that cannot happen. `ensure-universe.mjs` and
the types VFS build both refuse if it appears.

## TypeScript pin (contract with `factory/check`)

The kernel pins **TypeScript 6.0.3** in `universe/package.json` (also
recorded in `scripts/pins.mjs` / `kernel.json`). The pin is not on
`framework/runtime/package.json` — that package only declares workspace
tooling; the frozen compiler lives in the isolated universe install.

Why: `prebuild-types-vfs.mjs` ships the compiler's `lib/*.d.ts` into
`TYPES_VFS`. The check worker's LanguageService must run a compiler whose
libs match that VFS — otherwise diagnostics diverge from what the factory
baked.

**`factory/check` must depend on TypeScript 6.0.3** (same pin as
`framework/runtime/universe/package.json`). Do not bump the universe
TypeScript pin without updating the check worker in the same change.

The rest of the repo now follows the same pin. `check:workspace` reads
the version from `universe/package.json` and fails any workspace package
that declares a different one, so the universe is the single source of
truth for the compiler version. **TypeScript 7 is not used in this
repo.** Bumping the universe pin is therefore a repo-wide change: update
every package in the same commit and rebuild the kernel.

## `KERNEL_VERSION` bumps (operator consequence)

`scripts/pins.mjs` exports `KERNEL_VERSION`, which is baked into every
published app version and into the host's in-bundle kernel. The factory
serves the current version from the Worker bundle and older versions from
the `sfab-lite-kernel` R2 bucket (`pnpm upload-kernel-r2` on deploy). A
version that was never uploaded still returns **HTTP 409**
`error: "kernel_version_mismatch"` on `/kernel/…`.

`SERVER_SURFACE_HASH` is a separate digest over the eight **server** chunk
hashes. Sub-app server modules always come from the host bundle, so a
mismatch at serve time is **HTTP 409** `server_surface_mismatch`. Client-only
bumps leave the hash unchanged. Legacy rows with a null hash are served.

Republish picks up new kernel APIs and a matching server surface; it is not
required for client-only bumps after R2 history is uploaded.
