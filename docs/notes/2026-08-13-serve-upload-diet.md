# 2026-08-13 — Serve / upload diet

Non-authoritative (see [`README.md`](README.md)). Catalogue:
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).
**Not a check-cap experiment.** Do not mix these gzip numbers into isolate
heap claims.

**Status:** local probes done. Client minify is a real, cheap win. better-auth
deep plugin import does **not** shrink the vendor chunk. zod-compiler stays
pack-time inspiration, not an import-map package.

**Hypothesis:** (1) `browserShared` has no `minify: true`, so client chunks
are leaving gzip on the table. (2) The better-auth "barrel" is 2.1 MB because
we import the package root rather than `plugins/organization`. (3) Pack-time
Zod compile could drop `zod.js` from the server kernel.

## How to re-run

From the monorepo root, after `pnpm install` and
`pnpm --filter @sfab-lite/kernel install-universe`:

```bash
pnpm --filter @sfab-lite/check measure:serve-diet
```

Harness: `apps/check/scripts/measure-serve-diet.mjs`. Minifies committed
`packages/kernel/vendor/client/*` with esbuild; rebundles better-auth from
the universe with the same externals as prebuild; `npm view zod-compiler`
only (does not install it into the app).

## What we ran

Host: Node 24, 2026-08-13, worktree at `5d12a66` plus this harness.
Committed `kernel.json` already reports `better-auth.js` **2,199,578** raw /
**348,459** gzip and `zod.js` **523,007** / **76,887**.

### Client minify (`esbuild --minify` on committed chunks)

| chunk | gzip now | gzip min | saved |
| --- | ---: | ---: | ---: |
| react-dom-client.js | 170 KB | 107 KB | **63 KB** |
| base-ui-react.js | 268 KB | 172 KB | **95 KB** |
| tanstack-router.js | 43 KB | 29 KB | 15 KB |
| others | — | — | ~29 KB |
| **client total** | **662 KB** | **460 KB** | **197 KB** |

### Server better-auth minify

Committed barrel: 2.20 MB raw / 346 KB gzip. After `--minify`: **1.09 MB** /
**244 KB** gzip (**~102 KB** gzip saved).

### better-auth plugin surface (universe rebundle, node/cloudflare/drizzle external)

`scripts/vendor-entries/better-auth.mjs` already re-exports `betterAuth` +
`drizzleAdapter` + `organization` — not a whole-package dump at the entry.

| entry | raw | gzip |
| --- | ---: | ---: |
| same as prebuild (`better-auth/plugins`) | 2.19 MB | 346 KB |
| `better-auth/plugins/organization` + core | 2.19 MB | 346 KB |
| `organization` only (no `betterAuth`) | 0.92 MB | 147 KB |

Deep-importing the organization plugin **does not shrink** the chunk once
`betterAuth` is in the graph. The 2.2 MB is the core, not an unused plugins
index.

### zod-compiler

`npm view zod-compiler`: **1.26.2**, "Compile Zod schemas into zero-overhead
validation functions". **Not installed.** Default `output: "schema"` still
constructs Zod at load; a pack-time `output: "bag"` (or equivalent) is the
only shape that could drop `zod.js`. Do not put this package on the app
import map. Shared-only check is already 53 MB — Zod is not the check-cap
lever.

## Verdict

**Turn on client minify** when touching `prebuild-client.mjs` — ~197 KB gzip
off the client kernel, mostly `base-ui-react` and `react-dom-client`. Server
better-auth minify is another ~102 KB gzip if we want it; it does not need a
different entry. **Do not chase `plugins/organization` as an upload win.**
zod-compiler remains inspiration for AOT check/runtime specialization
elsewhere (see stub-VFS), not a Milestone 1 default.

## Does not imply

- Any change to check-worker heap.
- That factory upload (10 MB) is in trouble — kernel gzip is ~1.4 MB today.
- That we should add `zod-compiler` to `CLIENT_IMPORT_MAP` / `SERVER_IMPORT_MAP`.

## Follow-ups

- `minify: true` on `browserShared` (and optionally server vendor) in a
  dedicated prebuild PR, with `check:kernel` regeneration.
- Leave better-auth entry as it is.
