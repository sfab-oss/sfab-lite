---
name: catalog-modules
description: Admit, grow, retire, or probe a sfab-lite catalog module (R2 Loader ESM at serve, agreement-gated cheap surface.d.ts at check). Load when adding a pin, expanding L2, moving kernel vs catalog vs recipe, running check:modules / check:catalog-agreement / check:pin-placement, or using probe-catalog.mjs. Names scripts and kill criteria; does not narrate hand MCP tails.
---

# Catalog modules

Closed allowlist of opt-in npm pins. Serve is R2 Loader ESM
([ADR-0016](../../../docs/decisions/0016-catalog-modules-r2-and-typed-stubs.md)).
Check is a curated cheap `surface.d.ts` gated by CI agreement
([ADR-0017](../../../docs/decisions/0017-catalog-type-surfaces-agreement-gated.md)).
Hosted product check overlays the cheap surface, never the real `.d.ts`
closure (P2: 19/50 `exceededMemory`).

Do not drive hosted typecheck by hand (MCP `apps_create` / `workspace_write`
/ live tails). Use the scripts below.

## When to load

| Intent | Start here |
| --- | --- |
| Admit a new pin | [references/admit.md](references/admit.md) |
| Grow L2 after `LITE-SURFACE` | [references/grow.md](references/grow.md) |
| Retire / move placement | Admission rule below + `pnpm check:pin-placement` |
| Probe after republish | `factory/host/scripts/probe-catalog.mjs` |

## Admission (`check:pin-placement`)

A library goes to **one** of four places. Never both kernel and catalog.
`scripts/check-pin-placement.mjs` fails closed on overlap, on a catalog pin
with no recipe on-ramp, and on a catalog-enabling recipe seeded by ≥2
starters. Table: `docs/architecture/APP-FORMAT.md` §1.

- **Recipe** — source the app should own.
- **Kernel** — used by a starter *and* most apps (or types other kernel
  surfaces need).
- **Catalog** — opt-in server-plane capability; recipe on-ramp with a
  boundary; Loader child boots unpatched or with a documented patch.
- **Refuse** — Node-only APIs the Loader child lacks; canvas/DOM in the
  server plane; multi-MB families until a hosted probe says otherwise.

Moves: kernel→catalog when a starter stops needing it; catalog→kernel when
≥2 starters seed it. Encode the pin in `framework/modules/scripts/pins.mjs`
(`CATALOG_PINS`), not in a recipe body.

## Artifacts per pin

Under `framework/modules/<name>@<version>/`:

| File | Role |
| --- | --- |
| `surface.d.ts` | Cheap L2 overlay at `/node_modules/<name>/index.d.ts` |
| `seams.mjs` | `SEAMS[]` with a `why` for each cheap-vs-real signature miss |
| `manifest.json` | Written by `build-module.mjs` (bytes, hashes, `esbuild` pin) |
| `<esmFile>` | Isolated esbuild ESM (not imported by the host Worker) |

`assemble-catalog.mjs` unions pin dirs into
`framework/toolchain/src/generated/catalog-modules.json` (includes
`boundary` from `pins.mjs`). Pin builders must not write that JSON.

Recipe on-ramp: `registry/recipes/<slug>/<ver>/plants.json` targets **one**
boundary file (e.g. `src/pdf/invoice.ts`). Enable only via `apps_add` of a
recipe whose `dependencies` lists `<name>@<exact-version>`.

## Commands

Run from the repo root.

```bash
node framework/modules/scripts/build-module.mjs --pin=<name>@<version>
node framework/modules/scripts/assemble-catalog.mjs
node framework/modules/scripts/rebuild-catalog-modules.mjs   # all pins + assemble
pnpm check:modules                                           # regenerate-and-diff + red-test
pnpm check:catalog-agreement                                 # 0=0, plants, members, seams
pnpm check:pin-placement
node factory/host/scripts/probe-catalog.mjs                  # dry-run plan (default)
PROBE_CATALOG_LIVE=1 node factory/host/scripts/probe-catalog.mjs --live
```

`--live` is ask-first. It creates a throwaway erp on the bound org, then
deletes it. Refused without `PROBE_CATALOG_LIVE=1`. Never `git add .` on
the hosted app (the driver refuses that). Denylist: live M3 ERP, Pin2,
Talk, Video Demo, Grumpy Toaster.

Kill criteria (`probe-catalog-lib.mjs` `scoreTailEvents`): any
`exceededMemory`, fast-band `exceededMemory` (`cpuTime` < 6000 ms), or
other fast-band failure. Exit 1 if `kill`. Warm MCP `pnpm typecheck` is
not a memory result; count tails (`checkAttempts` / outcomes), not CD
green.

Default worker is `sfab-lite-check`. Do not point `--worker` at
`sfab-lite-check-exp` or deploy that worker without an explicit owner ask
(ALW-885).

## Diagnostics

| Code | Meaning | Next |
| --- | --- | --- |
| `LITE-RESOLVE` | Bare import not served, or catalog pin imported outside `boundary/` | Move the import, or this is not a catalog pin |
| `LITE-SURFACE` | Cheap overlay does not declare the member / arity | [grow.md](references/grow.md) |

Do not paper over a stub/real disagreement inside a recipe body.

## Where numbers go

- `docs/engineering/making-it-fit.md` §11 (pdf-lib / catalog check) and §12
  (exceljs). Append measured probe rows; add "Measured and rejected" only
  when a hosted isolate run is red.
- A dated note per probe under the packet or `docs/notes/`.
- Local heap is recorded by `check:catalog-agreement`, not gated. Local
  rank is not the isolate.

## Never

- Overlay the real package `.d.ts` on the hosted product server unit.
- Hand-drive hosted tails.
- `wrangler --remote` / `upload-modules-r2 -- --remote` except from the
  deploy job or an explicit owner ask.
- Touch live M3 ERP, Pin2, Talk, Video Demo, or Grumpy Toaster.
