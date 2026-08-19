# 2026-08-18 — Heavy starter (full catalog gallery)

Non-authoritative. Packet: starter family PR2 on `feat/starter-heavy`.

## What landed

`@sfab-lite/starter-heavy`: ERP domain floor + every published catalog
recipe (`HEAVY_SEED_RECIPES` = `catalogNames(CATALOG)`, 53 items)
assembled into the seed. `/gallery` imports each UI module (plus `cn` /
`useIsMobile`) as a client root and renders a minimal instance. Catalog
order: Base → ERP → Heavy. Default create stays `base`.

No recipes cut. No extra domain resource beyond ERP.

## Seed sizes

| starter | `seed.json` bytes | sourceFiles | migrations |
| --- | ---: | ---: | ---: |
| base | 190 387 | 71 | 1 |
| erp | 268 075 | 93 | 2 |
| heavy | 398 262 | 125 | 2 |

## Host gzip (`pnpm check:bundle-size`)

| | factory/host |
| --- | --- |
| before (PR1 / two seeds) | **3.80 MiB / 39.9%** |
| after (three seeds + heavy) | **3.87 MiB / 40.6%** |

Delta ≈ **+0.07 MiB**. Fail gate is ≥97%; clear headroom remains. Check /
lint / build workers unchanged at 2.98 / 9.17 / 4.53 MiB.

## measure:units

Skipped — `factory/check/scripts/measure-units.ts` is hardcoded to the
ERP seed; pointing it at heavy without a larger rewrite is out of scope
for this PR. Local evidence is seed file counts + `check:bundle-size`
above. Hosted create / `wrangler tail` also out of scope per brief.

## Walls

Did not hit the host upload wall. Check-isolate / create-alarm not
measured in this PR (no prod deploy).
