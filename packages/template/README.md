# @sfab-lite/template

The app every sfab-lite app starts as.

This package wears two hats, and the directory split is the whole design:

| Path         | What it is                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------- |
| `app/`       | **the payload** — the source tree seeded into a new app. Also runs standalone from right here. |
| `generated/` | `seed.json` — the baked pack output the factory imports as a bundle constant.                  |
| `src/`       | the package the factory imports. Today: `TEMPLATE_MANIFEST`.                                    |
| `scripts/`   | `pack.mjs` / `bake-seed`, which bake `app/` into `generated/seed.json`.                      |

Everything outside `app/` is scaffolding for us. Everything inside `app/`
is the ordinary single-project tree a new app starts as.

## Seeded app layout

The seed is a **single-project** tree (not a monorepo, no fake `packages/`):

| Path | Role |
| --- | --- |
| `package.json` | Describes the frozen kernel surface the app runs on. |
| `tsconfig.json` | TypeScript chrome (mirrors the host check surface). |
| `biome.json` | Injected at pack from `packages/core/app-biome.json` (not stored as `app/biome.json` — that would nest-root the monorepo Biome). Same rules the factory lint worker applies. |
| `components.json` | shadcn orientation for the seed UI tree. |
| `vite.config.ts` | Vite chrome (standalone package still uses the package-root Vite config with `root: "app"`). |
| `src/db/` | Schema under `schema/{auth,catalog,transactions}.ts`. |
| `migrations/` | Applied SQL migrations (root of the app tree). |
| `src/hono/` | API tiers: `public/` / `protected/` / `org-protected/`. |
| `src/contract/` | Shared Zod schemas for Hono + hooks. |
| `src/ui/components/` | `ui/` (shadcn), `layout/`, `providers/`. |
| `src/ui/hooks/` | Data hooks (`use-entities`, `use-session`, …). |
| `src/ui/lib/` | Client, auth client, money helpers. |
| `src/ui/routes/` | SPA pages (code-based router in `src/ui/router.tsx`). |

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
the repo root) checks `app/src` against `packages/core/app-biome.json`, the
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
`src/ui/main.tsx` and a `?? ""` fallback that silently produced the wrong
CSS when the styles entry moved. Now `pack.mjs` and the factory both read
the manifest, and `scripts/check-workspace.mjs` fails CI the moment a
declared path stops existing. `inject` adds pack-only files (today:
`biome.json` from core).

Renaming a payload entry point is therefore a two-line change: move the
file, update `manifest.json`.

## The shadcn subset, and why it is a subset

The seed carries a slice of the starter's shadcn layer: `alert`, `avatar`,
`badge`, `button`, `card`, `dropdown-menu`, `empty`, `field`, `input`,
`label`, `native-select`, `sheet`, `sidebar`, `skeleton`, `spinner`,
`table`, `tooltip`.

`separator` left with the flat header the sidebar replaced — the same rule
that took `textarea` out with the notes form. Port it back with the first
route that needs it.

Two different reasons keep the rest out, and it is worth not confusing them,
because only one of them is a real constraint:

- **Genuinely blocked** — the upstream shadcn source needs a third-party
  package the kernel does not serve: `command` (cmdk), `sonner`, `chart`
  (recharts), `carousel` (embla), `calendar` (react-day-picker), `drawer`
  (vaul), `resizable`, `markdown` (streamdown). These need a kernel decision
  before they can be ported at all.
- **Merely not ported yet** — `tabs`, `switch`, `popover`, `progress`,
  `slider`, `toggle`, `radio-group`, `collapsible`, `hover-card`,
  `aspect-ratio` and friends need only `@base-ui/react` and `cn`, both of
  which the kernel already serves. So do the rest of the overlay/menu/select
  family — `dialog`, `select`, and the like: `dropdown-menu`, `sheet`,
  `tooltip`, and `sidebar` from that family already ship, and porting another
  means swapping its `lucide-react` import for the matching Radix icon.
  `command` is the exception: it is built on `cmdk`, which no icon set makes
  available. They are absent because **every file here ships into every app**,
  and `knip` rejects a seed file nothing imports. Add one the moment a route
  actually uses it.

That rule cuts the other way too, and the ERP port is where it bit:
`textarea` left with the notes form, and `CardAction` and `EmptyMedia` left
with the page that used them. Deleting an unused part of a ported component
is the house move, not a regrettable one — `field` was already only four of
the starter's ten pieces. Port the rest back with the first route that needs
them.

That second list is the useful one: it is not a wishlist, it is a set of
components already known to work under the frozen kernel.

The same rule explains the partial ports. `field` exports four of the
starter's ten pieces, and `FieldError` is not among them — the seed's forms
surface errors through `Alert`, which already carries `role="alert"`, so a
per-field error component would be an unused file. Port the rest of `Field`
together with the first form that needs inline validation, not before.

`spinner` and `native-select` are the two hand-written divergences, and both
now draw a real icon: `UpdateIcon` and `ChevronDownIcon`. `native-select`
stays native because shadcn's `Select` is a popover the seed does not carry.

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

- **Parties** (`entity`) — the customers and vendors the org trades with.
- **Catalog** (`product`) — SKU, name, unit price in minor units.
- **Documents** (`document`, `document_line`) — invoices, built as drafts and
  then issued.

Three things in there are the parts worth copying, and each is a rule the
starter learned the expensive way:

1. **Every query is scoped by the session's active organization**, taken from
   `requireOrg` and never from the request. Writes match on id *and*
   organization in a single statement, so an empty `returning()` is the 404
   and there is no window between checking ownership and acting on it.
2. **A draft is working state; a finalized document is a record.** Lines,
   pricing, and deletion are all draft-only, and finalize draws the
   organization's next number inside the same statement that writes it —
   two documents finalizing at once cannot read the same highest number and
   both keep it.
3. **Lines carry snapshots.** `entity_name_snapshot`, `name_snapshot`, and
   the line's own `unit_price_cents` mean renaming a customer or re-pricing a
   product never rewrites an invoice already sent.

What it deliberately does *not* have is the rest of the starter's document
model: document families and their CHECK constraints, payment projections,
settlement status, immutable-successor lineage. This is a seed every
generated app starts from, so weight here is paid by every app that has
nothing to do with invoicing.

Swap the resource, keep the shape.
