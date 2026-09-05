# Grow a catalog surface

A `LITE-SURFACE` diagnostic means the cheap overlay did not declare the
member or arity the app used. It is not a pdf-lib / exceljs (or Hono)
bug. Grow the pin, or tell the agent to stay on L2.

Do not fix a stub/real disagreement by editing the recipe body. Do not
overlay the real `.d.ts` on hosted check.

## Member vs seam

| Signal | Action |
| --- | --- |
| App needs a real API that L2 should include | Add it to `surface.d.ts`. Keep the surface small. |
| Cheap and real signatures disagree on purpose | Add a `SEAMS` row with a `why` (`seams.mjs`). `check:catalog-agreement` fails a mismatch with no why. |
| Import is outside `boundary/` | That is `LITE-RESOLVE`, not growth. Move the call into the boundary helper. |

Hono typed-overlay misses also rewrite to `LITE-SURFACE`
(`framework/verbs/src/check/surface-diagnostic.ts`). Same rule: grow the
Hono overlay in its own track, not by copying library `.d.ts` into the
catalog pin.

## Plants

`registry/recipes/<slug>/<ver>/plants.json`: `find` a healthy call in the
single boundary file, `replace` with a type-error. Agreement requires the
plant to fire on the cheap overlay; on the real `.d.ts` too unless
`sides: "cheap"`.

When you add a surface member, add a plant that would have been silent if
the member were missing or widened (the gate's red-tests drop a member /
widen a parameter on pdf-lib). Register needles in
`REQUIRED_PLANT_NEEDLES` if this is a new recipe.

## Republish

1. Edit `surface.d.ts` and/or `seams.mjs`.
2. `node framework/modules/scripts/build-module.mjs --pin=<name>@<version>`
   (stub bytes/hash land in `manifest.json`; ESM may be unchanged).
3. `node framework/modules/scripts/assemble-catalog.mjs`
4. `pnpm check:modules` and `pnpm check:catalog-agreement`
5. Hosted probe: `node factory/host/scripts/probe-catalog.mjs` (dry-run
   first). `--live` is ask-first (`PROBE_CATALOG_LIVE=1`). Always probe on
   republish; the script is the publish gate, not a hand tail.

Kill: any `exceededMemory` or fast-band failure. Write a dated note and
append `making-it-fit.md` §11/§12. Local heap from agreement is not a
memory claim.
