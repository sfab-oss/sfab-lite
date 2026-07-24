# `@sfab-lite/kernel`

Frozen dependency universe for factory-built apps: server LOADER chunks,
client import-map chunks, types VFS (check worker), and CSS VFS (Tailwind
compile).

```sh
pnpm --filter @sfab-lite/kernel build
```

Regenerates `vendor/`, `kernel.json`, and `src/generated/*` from the pinned
inputs. Same inputs → byte-identical outputs (wall-clock timestamps are not
written into committed artifacts).

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
