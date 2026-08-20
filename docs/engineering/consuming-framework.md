# Consuming `framework/*` from another checkout (git/workspace path)

Proven 2026-08-20 against `main` @ `9e49ef8`: a checkout outside this
repo validated a starter manifest, then ran `lint` and `check` as
libraries against the `base` starter (0 errors / 0 diagnostics across
all three check units), including kernel `install-universe` +
`prebuild` run in the consumer's own checkout — with zero `factory/`
code in the consumer's dependency graph.

This is the pre-publishing consumption path. When dist builds and
published packages exist, most of the caveats below disappear.

## Layout

Vendor this repo (or a sparse checkout of `framework/` plus a starter
for seed data) next to a consumer pnpm workspace:

```text
<consumer-root>/
  vendor/sfab-lite/        # clone of this repo
  consumer/
    package.json           # private, packageManager: pnpm
    pnpm-workspace.yaml
    app/                   # the consumer package
```

`consumer/pnpm-workspace.yaml` — this is the whole mechanism:

```yaml
packages:
  - "app"
  - "../vendor/sfab-lite/framework/*"
allowBuilds:
  esbuild: false
```

`app/package.json` dependencies: `@sfab-lite/core`, `@sfab-lite/kernel`,
`@sfab-lite/verbs` (all `workspace:*`), `typescript` (kept external —
the check runner needs the real package at runtime), and `esbuild` as a
devDependency for the runner below.

Do **not** add `factory/*` to the workspace. Do **not** import
`@sfab-lite/starter-*` unless you want starters as packages — reading a
starter's `generated/seed.json` as data is enough for the verb APIs
(`files` + `manifest` in memory).

## What the root workspace config you do NOT need

Measured against this repo's root `pnpm-workspace.yaml`: the consumer
needed **none** of `overrides`, `packageExtensions`,
`patchedDependencies`, or `minimumReleaseAge`, and no `allowBuilds`
entries beyond its own `esbuild` — those root entries protect packages
that never enter the consumer graph. The kernel's universe is its own
nested workspace with its own committed policy; a consumer does not
replicate it.

## Commands

```bash
cd consumer
pnpm install
pnpm --filter @sfab-lite/kernel install-universe
pnpm --filter @sfab-lite/kernel exec node scripts/prebuild.mjs

cd app
node proof-manifest.ts   # direct Node import of @sfab-lite/core/validate-manifest
node run.mjs lint.ts <path-to-seed.json>
NODE_OPTIONS=--max-old-space-size=8192 node run.mjs check.ts <path-to-seed.json>
```

Kernel scripts resolve from their own package location — there is no
repo-root path assumption; `prebuild` output matches the committed
artifacts (git stays clean).

## Caveats (the Node host recipe)

1. **`@sfab-lite/verbs` is not naively Node-importable.** Its internal
   imports use `.js` specifiers against `.ts` sources, which Workers
   bundlers resolve but Node type-stripping does not. Until dist builds
   exist, a Node consumer bundles with esbuild, aliasing
   `@sfab-lite/verbs` and `@sfab-lite/core` to their `src/` directories
   and keeping `typescript` and `@sfab-lite/kernel` external — the same
   shape as `factory/check/scripts/esbuild-proof-flags.mjs`.
2. **Lint's wasm import is Workers-shaped.**
   `run-lint.ts` imports `@biomejs/wasm-web/…_bg.wasm` expecting a
   `WebAssembly.Module` (a Cloudflare module rule). On Node, add an
   esbuild plugin that reads the `.wasm` bytes and constructs the
   module. A Worker host uses wrangler rules instead and needs no
   plugin.
3. **Locate package `src/` from a real subpath export** (e.g.
   `dirname(require.resolve("@sfab-lite/verbs/lint")) + "/.."`) —
   `./package.json` is exported for this too.
4. `@sfab-lite/core/validate-manifest` and `@sfab-lite/kernel` load
   directly on Node ≥ 24 (type-stripping) with no bundler.

## Verifying factory independence

After install, confirm zero `factory/` reach the same way the proof
did: no `factory` paths in the consumer lockfile, `require.resolve` of
every `@sfab-lite/*` entry point lands under `framework/`, and an
esbuild metafile of the bundled runner contains no input under
`factory/`.
