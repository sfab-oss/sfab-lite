# @sfab-lite/template

The app every sfab-lite app starts as.

This package wears two hats, and the directory split is the whole design:

| Path         | What it is                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------- |
| `app/`       | **the payload** — the source tree seeded into a new app. Also runs standalone from right here. |
| `generated/` | `seed.json` — the baked pack output the factory imports as a bundle constant.                  |
| `src/`       | the package the factory imports. Today: `TEMPLATE_MANIFEST`.                                    |
| `scripts/`   | `pack.mjs` / `bake-seed` / `generate-format-files.mjs`.                      |

Everything outside `app/` is scaffolding for us. Everything inside `app/`
is the ordinary single-project tree a new app starts as.

## Seeded app layout

The seed is a **single-project** tree (not a monorepo, no fake `packages/`):

| Path | Role |
| --- | --- |
| `package.json` | **Generated** — exact runtime pins from `generateFormatFiles`. Drift-gated by `pnpm check:generated`. Do not hand-edit. |
| `tsconfig.json` | **Generated** — same regime (`types: []`, `include: ["src"]`). |
| `biome.json` | Injected at pack from `framework/toolchain/app-biome.json` (not stored as `app/biome.json` — that would nest-root the monorepo Biome). Same rules the factory lint worker applies. |
| `components.json` | **Generated** — `@lite` → `https://lite.sfab.dev/r/{name}.json` is the only registry. |
| `index.html` | **Generated** — document shell (title, favicon, `#root`, module script). Host injects the import map at pack. |
| `vite.config.ts` | Vite chrome (standalone package still uses the package-root Vite config with `root: "app"`). |
| `src/db/index.ts` | **Generated** — adapter db shim (`createDb` / `Db`). Drift-gated with the other format files. Do not hand-edit. |
| `src/db/` | Schema barrel `schema.ts` re-exports `auth.ts` + `ledger.ts`. |
| `migrations/` | Applied SQL migrations (root of the app tree). |
| `src/server.ts` | Hono export `app` (factory server entry). |
| `src/hono/` | API tiers: `public/` / `protected/` / `org-protected/`. |
| `src/contract/` | Shared Zod schemas for Hono + hooks. |
| `src/router.tsx` | Client entry: route tree and `createRoot` mount. |
| `src/routes/` | Page modules, registered in `router.tsx`. |
| `src/components/layout/` | App shell, top nav, auth shell. |
| `src/components/ui/` | Registry recipes (`button`, `card`, `field`, `input`, `label`, `table`). |
| `src/hooks/` | Data hooks (`use-parties`, `use-session`). |
| `src/lib/` | Client, auth client, money helpers, `utils` (`cn`). |

`wrangler` config is **not** seeded this pass.

## Run it standalone

```sh
cp .dev.vars.example .dev.vars      # then put a ≥32-char secret in it
pnpm --filter @sfab-lite/template db:migrate
pnpm --filter @sfab-lite/template dev
```

That starts two processes: `wrangler dev` on 8787 (the Hono API against a
local D1) and Vite on 5173 (the SPA, proxying `/api` to 8787). Open
<http://localhost:5173>.

`pnpm preview` is the production-shaped path instead — one Worker on 8787
serving the built SPA from its assets binding, which is closer to how the
factory serves an app.

Useful:

- `pnpm db:reset` — drop the local D1 and re-migrate.
- `pnpm typecheck` — both configs (see below).
- `pnpm generate` — rewrite the generated format files under `app/`
  (`package.json`, `tsconfig.json`, `index.html`, `components.json`,
  `src/db/index.ts`, and `src/storage/index.ts` when the manifest
  declares storage) from the manifest + current runtime pins.
  `pnpm check:generated` (repo root) fails if they drift; do not
  hand-edit them.
- `pnpm pack` — print the seed payload to stdout.
- `pnpm bake-seed` — write `generated/seed.json` (what `check:seed` verifies).

## Two TypeScript configs, on purpose

`tsconfig.json` covers the package (`src/`, `vite.config.ts`) and is ordinary.

`tsconfig.app.json` covers `app/` and deliberately **mirrors the factory's
check worker** rather than a comfortable local setup. It declares `types: []`
and pulls in `@sfab-lite/core`'s `cloudflare-ambient.d.ts` — the same small
hand-written Cloudflare surface the factory bakes into its types VFS. Neither
`@cloudflare/workers-types` nor `vite/client` is available, because the
factory does not have them either.

The rule: **stricter here is fine, looser is not.** A green `tsc` in this
package must imply a green check in the factory. That is why the exploration's
`types: ["vite/client"]` is gone — it hid a missing `*.css` module
declaration, which the host then had to paper over by ignoring diagnostic
TS2882 at the publish gate. `app/src/globals.d.ts` declares it properly and
ships with the payload, so the ignore list can go away.

## Payload rules

Code under `app/` is compiled twice: by Vite here, and by the factory's
esbuild + kernel import map there. Only the intersection is safe.

- **No Vite-only import syntax.** No `?raw`, no `?url`, no
  `import.meta.glob`, no `import.meta.env`.
- **No path aliases.** Relative imports only. `vite.config.ts` defines no
  `resolve.alias`, so what works here works there.
- **No PostCSS plugins.** The factory extracts CSS with Tailwind's own
  engine and nothing else.
- **No Node-only APIs.** `node:*` is not in the kernel; this is a Worker.
- **Dependencies are the frozen kernel.** The versions in `package.json`
  match `kernel.json` exactly. Adding a dependency here does not add it to
  the kernel — an app can only import what the kernel serves via its client
  and server import maps. `@base-ui/react` (and its public subpaths) is
  vendored into the client kernel and resolved through the import map, not
  bundled into the app. `@radix-ui/react-icons` is vendored the same way but
  as a barrel only: `@radix-ui/react-icons` resolves, a deep import into its
  `dist/` does not.
- **Every file is user-visible.** Unused exports, dead components, and
  commented-out code ship into every app ever created. `knip` runs over
  `app/` with its own entry points for exactly this reason.

Two of these are enforced rather than trusted: `pnpm check:app-lint` (from
the repo root) checks `app/src` against `framework/toolchain/app-biome.json`, the
config the factory's lint worker uses — so the seed cannot ship code that
lights up diagnostics the moment someone opens it. And `tsconfig.app.json`
is what stops a Vite-only convenience compiling here and failing there.

## The manifest

`manifest.json` declares where the payload's entry points are: the server
entry and the export name the factory wraps, the client entry, the styles
entry, the safelist, the migrations directory, and which files are
standalone-only and must not be seeded.

It exists because the exploration hardcoded those paths in six places
across the host — including a regex over the literal string
`src/router.tsx` and a `?? ""` fallback that silently produced the wrong
CSS when the styles entry moved. Now `pack.mjs` and the factory both read
the manifest, and `scripts/check-workspace.mjs` fails CI the moment a
declared path stops existing. `inject` adds pack-only files (today:
`biome.json` from core).

Renaming a payload entry point is therefore a two-line change: move the
file, update `manifest.json`.

## Shared UI comes from the registry

The seed does not carry a parallel shadcn tree. Shared primitives are
**assembled from the published catalog** via `planAdd` (the hosted `add`
planner), and each file is provenance-recorded in `manifest.recipes`:

`lite/utils`, `lite/button`, `lite/label`, `lite/input`, `lite/field`,
`lite/card`, `lite/table`, `lite/select`, `lite/alert`,
`lite/empty-state`, `lite/sidebar`, `lite/dropdown-menu`, `lite/avatar`,
`lite/dialog`, `lite/breadcrumb`, `lite/badge`, `lite/alert-dialog`
(and the sidebar's sheet/tooltip/skeleton/separator/use-mobile deps)
(all `@0.1.0`).

`pnpm --filter @sfab-lite/registry assemble-erp-starter` re-runs that
assembly from `ERP_SEED_RECIPES` (the recipes the ERP screens import;
the catalog is larger and add-only). `pnpm check:manifest`
fails when the tree or `manifest.recipes` drifts from it, so do not
hand-edit a recipe file or hand-copy one into `src/components/ui/` —
add it to the catalog, then either assemble it into the seed list or
`add` it onto an app.

Kind is a `lite/select` (create dialog) and a `lite/badge` on lists.
Errors use `lite/alert`. Empty lists use `lite/empty-state`. Navigation
is an inset `lite/sidebar`; the main column is `SidebarInset`. Create
and ledger writes open from header/card **dialogs**. Delete is an
**alert-dialog** on the party record. The org/user menu is the sidebar
footer.

## Icons

`@radix-ui/react-icons` is the app's icon set, and the whole of it is served
— all 318, not a curated subset. That completeness is the point: an agent
cannot see which icons a subset holds, so it would discover the boundary one
typecheck failure at a time. A finite library it can name from priors beats a
smaller one it has to probe.

It is affordable because of what icons actually cost. The bundle was never
the constraint — even all of Lucide would be under 5% of the client kernel.
The types are: the check worker runs one TypeScript program over the types
VFS inside a 128 MB isolate. Serving every Radix icon adds 89.5 KB there
(320 files, +1.06%); Lucide's declarations are ~1.96 MB. That ratio, not the
icon count, decided this.

Draw icons from the package. Hand-rolled inline SVG is now a smell.

## What the app does

Enough to prove the stack end to end, and no more: email/password auth
(better-auth) with organizations, an onboarding step that creates the first
org, and a small per-organization ERP.

- **Parties** (`party`) — the customers and vendors the org trades with.
- **Ledger** (`ledger_entry`) — charges and payments; amounts are always
  stored positive, and the kind is the sign.
- **Open balances** — parties whose running balance (charges − payments)
  is not zero.

Two things in there are the parts worth copying, and each is a rule the
starter learned the expensive way:

1. **Every query is scoped by the session's active organization**, taken from
   `requireOrg` and never from the request. Writes match on id *and*
   organization in a single statement, so an empty `returning()` is the 404
   and there is no window between checking ownership and acting on it.
2. **Balance is computed in the app**, from builder `select`s, not from a
   stored column and not from drizzle's relational `db.query.*` API. The
   query seam stays on auth/session; the ERP slice does not use it.

What it deliberately does *not* have is aging, statements, documents, or
inventory. This is a seed every generated app starts from, so weight here
is paid by every app that has nothing to do with invoicing.

Swap the resource, keep the shape.
