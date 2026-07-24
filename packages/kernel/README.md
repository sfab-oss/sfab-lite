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
and resolves from `packages/kernel/universe/` — a nested mini-workspace with
its own `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml`. Install
runs with `cwd=universe` so pnpm never joins the monorepo workspace and
cannot re-resolve optional peers from `apps/*` / other packages.

Guarantees:

1. **Reproducibility given the universe lockfile** — same
   `universe/package.json` + `universe/pnpm-lock.yaml` → byte-identical
   artifacts on rebuild.
2. **Workspace isolation** — adding or removing an unrelated workspace
   package (and its peers) must not change any kernel artifact byte.
3. **Drift detection** — `pnpm check:kernel` rebuilds and fails if committed
   `vendor/`, `kernel.json`, or `src/generated/*` differ. CI job `kernel`
   enforces the same.

Two consecutive builds in one worktree only prove determinism for a fixed
install graph. Isolation + the drift gate are what make the universe frozen
across monorepo churn.

Shared app pins (react, hono, zod, …) are **read from
`packages/template/package.json` at prebuild time** — they are not
hand-copied. `universe/package.json` must list the same versions (validated
by `scripts/ensure-universe.mjs`). Only kernel tooling pins (`esbuild`,
`typescript`) are declared in `scripts/pins.mjs` as tooling; client extras
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
*optional* peer. When another workspace package (e.g. `apps/lint`) provides
that peer, a workspace-hoisted install re-resolves those packages and
silently changes vendor chunks and the types VFS. The isolated universe
never declares the peer, so that cannot happen. `ensure-universe.mjs` and
the types VFS build both refuse if it appears.

## TypeScript pin (contract with `apps/check`)

The kernel pins **TypeScript 6.0.3** (`scripts/pins.mjs` / `kernel.json`).
That is intentional and **different from the monorepo root** (currently
7.0.2).

Why: `prebuild-types-vfs.mjs` ships the compiler's `lib/*.d.ts` into
`TYPES_VFS`. The check worker's LanguageService must run a compiler whose
libs match that VFS — otherwise diagnostics diverge from what the factory
baked.

**`apps/check` must depend on TypeScript 6.0.3** (same pin as this package).
Do not bump the kernel's TypeScript pin without updating the check worker
in the same change. The root / factory / template TypeScript versions are
unrelated to this contract.
