# Template port: what the host inherits

Non-authoritative working note. The template now lives in
`packages/template`, runs standalone, and is clean under the repo's gates.
Porting it surfaced things the host must do differently. They are recorded
here rather than in the code, because the code they concern did not exist
yet when this was written.

## Delete on arrival

Three exploration workarounds exist only because of scars this port fixed.
Do not port them:

- **`IGNORED_CHECK_CODES = new Set([2882])`** in the publish gate. TS2882 was
  the unresolved `*.css` side-effect import; the exploration template hid it
  behind `types: ["vite/client"]`, which the factory does not have. The
  payload now ships `app/src/globals.d.ts` declaring `*.css`, so the
  diagnostic does not occur and the ignore list has nothing to ignore.
- **The `"/api/` string rewrite** in `serve.ts`. It existed because the SPA
  hardcoded absolute `/api/...` paths that were wrong under a `/a/:appId`
  prefix. The UI now builds every URL from `window.__SFAB_PUBLIC_BASE__`
  (`app/src/ui/lib/public-base.ts`), so the served bundle needs no patching.
- **`default-app-migrations.ts`**, a hand-pasted SQL snapshot that drifted
  from the template. `scripts/pack.mjs` emits migrations from
  `app/migrations/` as part of the seed.

## Read from the manifest, not from string literals

The exploration hardcoded template paths in six places across the host —
`compile-server.ts`, `compile-client.ts` (including a regex over the literal
`src/ui/main.tsx`), `compile-css.ts` twice (one of them a silent `?? ""`
fallback for the styles entry), `seed.mjs`, and the migrations snapshot.

All six now have one source: `packages/template/manifest.json`, re-exported
as `TEMPLATE_MANIFEST` from `@sfab-lite/starter-erp`. `check:workspace` fails if
a declared path stops existing.

## The seed payload is a build-time constant

The factory host is a Worker with no filesystem, so the seed cannot be read
at runtime. `pnpm --filter @sfab-lite/starter-erp pack` emits
`{ manifest, sourceFiles, migrations }`; the factory bakes that into its
bundle. Worth diffing the first output against the exploration's seed
snapshot — same 32 source files, minus `app/src/worker.ts` and
`app/index.html`, which are standalone-only and excluded by the manifest.

## Two configs the factory must import, not re-derive

- **`@sfab-lite/core`'s `APP_BIOME_CONFIG`** — what the lint worker applies
  to app sources. Backed by a real Biome config file
  (`packages/core/app-biome.json`) so that `pnpm check:app-lint` can run the
  payload against it. Hand-writing this is a trap: the first draft used
  `recommended: true` with the repo's rule offs and produced 13 diagnostics
  on untouched seed files — wrong formatter options, no Tailwind directive
  support, and suppression comments for rules the config did not enable.
- **`packages/core/src/cloudflare-ambient.d.ts`** — the Cloudflare surface an
  app may see. The kernel prebuild should bake it into the types VFS as
  `/types/cloudflare-ambient.d.ts`; `packages/template/tsconfig.app.json`
  already typechecks against it, so the two stay honest.
