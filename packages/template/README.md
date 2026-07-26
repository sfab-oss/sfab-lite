# @sfab-lite/template

The app every sfab-lite app starts as.

This package wears two hats, and the directory split is the whole design:

| Path       | What it is                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------- |
| `app/`     | **the payload** — the source tree seeded into a new app. Also runs standalone from right here. |
| `src/`     | the package the factory imports. Today: `TEMPLATE_MANIFEST`.                                    |
| `scripts/` | `pack.mjs`, which bakes `app/` into the seed JSON the factory ships as a constant.               |

Everything outside `app/` is scaffolding for us. Everything inside `app/`
is code the user will open, read, and edit.

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
- `pnpm pack` — print the seed payload; `pnpm pack -- --out=seed.json` to a file.

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
  bundled into the app. Prefer deep imports over barrels for anything
  icon-shaped.
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
declared path stops existing.

Renaming a payload entry point is therefore a two-line change: move the
file, update `manifest.json`.

## The shadcn subset, and why it is a subset

The seed carries a deliberately small slice of the starter's shadcn layer:
`alert`, `avatar`, `badge`, `button`, `card`, `empty`, `field`, `input`,
`label`, `separator`, `skeleton`, `spinner`, `textarea`.

Two different reasons keep the rest out, and it is worth not confusing them,
because only one of them is a real constraint:

- **Genuinely blocked** — the upstream shadcn source imports something the
  kernel does not serve. `lucide-react` is nearly all of this: the
  overlay/menu/select family (dialog, dropdown-menu, select, sheet, sidebar,
  command, …) uses icons. So do the third-party-backed ones: `sonner`,
  `chart` (recharts), `carousel` (embla), `calendar` (react-day-picker),
  `drawer` (vaul), `resizable`, `markdown` (streamdown). These need a kernel
  decision before they can be ported at all.
- **Merely not ported yet** — `tabs`, `tooltip`, `switch`, `table`,
  `popover`, `progress`, `slider`, `toggle`, `radio-group`, `collapsible`,
  `hover-card`, `aspect-ratio` and friends need only `@base-ui/react` and
  `cn`, both of which the kernel already serves. They are absent because
  **every file here ships into every app**, and `knip` rejects a seed file
  nothing imports. Add one the moment a route actually uses it.

That second list is the useful one: it is not a wishlist, it is a set of
components already known to work under the frozen kernel.

The same rule explains the partial ports. `field` exports four of the
starter's ten pieces, and `FieldError` is not among them — the seed's forms
surface errors through `Alert`, which already carries `role="alert"`, so a
per-field error component would be an unused file. Port the rest of `Field`
together with the first form that needs inline validation, not before.

The `spinner` is the one hand-written divergence: a small inline SVG rather
than a Lucide icon, so pending buttons work without the blocked dependency.
It is a one-off today. **Before porting anything else that wants an icon,
decide whether this becomes inline-SVG-per-component or a minimal vendored
icon set** — drifting into a dozen hand-drawn SVGs without choosing is the
failure mode.

## What the app does

Enough to prove the stack end to end, and no more: email/password auth
(better-auth) with organizations, an onboarding step that creates the first
org, and per-organization notes CRUD. Every note query is scoped by the
session's active organization in `app/src/hono/routes/notes.ts` — that
scoping is the pattern worth copying, not the notes themselves.
