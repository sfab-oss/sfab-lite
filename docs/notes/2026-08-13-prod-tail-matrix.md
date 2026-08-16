# 2026-08-13 — Production tail matrix

Non-authoritative (see [`README.md`](README.md)). Catalogue:
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).
Priors: [`2026-08-13-stack-typed-shallow.md`](2026-08-13-stack-typed-shallow.md),
[`2026-08-13-snapshot-accumulating-hono.md`](2026-08-13-snapshot-accumulating-hono.md).
Direction: decision 8 in
[ADR-0010](../decisions/0010-runtime-type-surface-independent-and-checked-in-units.md) (was the 2026-08-12 direction note, graduated 2026-08-15).

**Status:** adopted (units architecture). Cheap-surface union does **not**
fit production.
**Hypothesis:** five program shapes, driven ≥50 times each on a real
isolate, counted by `exceededMemory` in a live tail. Zero OOMs = fits.
The fork: if the 255 MB cheap-surface union is 0/50, a single-program
worker is viable; any OOMs confirm check units.

## How to re-run

Throwaway worker only (`sfab-lite-check-exp`). Never deploy
`wrangler.jsonc` / `sfab-lite-check`. From `apps/check`, after
`pnpm install` and `pnpm --filter @sfab-lite/kernel install-universe`:

```bash
# bake program-5 snapshot (optional; committed baked-api-dts.ts is enough)
NODE_OPTIONS=--max-old-space-size=8192 WRITE_DTS=src/exp/baked-api-dts.ts \
  pnpm --filter @sfab-lite/check measure:snapshot

pnpm exec wrangler deploy --dry-run --outdir .tmp/exp-dry -c wrangler.exp.jsonc
pnpm exec wrangler deploy -c wrangler.exp.jsonc
printf '%s' "$ADMIN_TOKEN" | pnpm exec wrangler secret put ADMIN_TOKEN -c wrangler.exp.jsonc

node scripts/drive-exp-matrix.mjs \
  --base-url "https://sfab-lite-check-exp.<subdomain>.workers.dev" \
  --token "$ADMIN_TOKEN" \
  --n 50 \
  --out .tmp/exp-matrix

pnpm exec wrangler delete -c wrangler.exp.jsonc --force
```

The driver starts `scripts/watch-tail.mjs`, which opens Cloudflare's
Workers tail websocket (not piped `wrangler tail` — that block-buffers
and looks alive while delivering nothing). Heartbeats every 2s;
`TAIL_GAP` if HTTP finishes with no matching `?run=` event.

## What we ran

Host: `oracle-cool-big-child-1`, Linux 6.8.0-1047-oracle, Node 24,
wrangler 4.113.0. Base: `main` @ `a87dd63` plus this harness. Worker
`sfab-lite-check-exp`, `workers_dev: true`, no bindings. Dry-run upload
20598 KiB / gzip **3029 KiB**. Version after secret:
`bdbbee43-0785-4193-8633-62a8ffcad472`. Window: 2026-08-13 21:55–22:39 UTC
(~44 min). 2 s spacing. Every `/exp/*` and `/health` gated on
`X-Admin-Token`.

Summary (`apps/check/.tmp/exp-matrix/summary.json`):

```
{"union":{"n":50,"ok":50,"exceededMemory":0,"http200":50,"tailGaps":0},
 "cheap-union":{"n":50,"ok":46,"exceededMemory":4,"http200":46,"tailGaps":0},
 "server-unit":{"n":50,"ok":50,"exceededMemory":0,"http200":50,"tailGaps":2},
 "accumulating-emit":{"n":50,"ok":50,"exceededMemory":0,"http200":50,"tailGaps":0},
 "client-snapshot":{"n":50,"ok":50,"exceededMemory":0,"http200":50,"tailGaps":0}}
```

Tail session: 250 events, `ok` 246 / `exceededMemory` 4, one websocket
`1006` restart. The two `server-unit` `tail_gap` rows were HTTP 200 with
a dropped event during that restart; retried; not counted as OOM.

| # | program | local | prod `exceededMemory` | sample (ok) |
| --- | --- | ---: | ---: | --- |
| 1 | union (real VFS, 71 `/app/src` roots) | 340 | **0/50** | loadedFiles 1367, diags 0, ~14–25 s |
| 2 | cheap-union (typed drizzle+Hono + shallow) | 255 | **4/50** | loadedFiles 1281, stubbedFiles 93 |
| 3 | server-unit (`hono/index.ts`, typed, no accum) | 93 | **0/50** | loadedFiles 401, diags 0, ~2–3 s |
| 4 | accumulating-emit (full server + `typeToString`) | 146 | **0/50** | loadedFiles 401, ~5 s |
| 5 | client-snapshot (`main.tsx` + baked `api.d.ts`) | 147–175 | **0/50** | loadedFiles 1251, diags 1 (`styles.css`) |

Cheap-union kills (HTTP 503, tail `exceededMemory`, cpu ~5–6 s):

```
2fdda192-0f51-4970-a757-af784a5a6de8  http=503  ms=7630
7b20e732-9019-4a93-86c1-2347468fc94d  http=503  ms=6578
8cb5eda1-79c2-49bd-929c-8710cac2a00e  http=503  ms=7547
07af1c4e-78b2-42f9-b554-397d102cd983  http=503  ms=7543
```

Tail excerpt (one of four; query `run=` redacted by the tail):

```
{"outcome":"exceededMemory","scriptName":"sfab-lite-check-exp",
 "url":"https://sfab-lite-check-exp.alejandrowurts.workers.dev/exp/cheap-union?run=…",
 "cpuTime":5710,"wallTime":7216}
```

Auth probe before the matrix: `/health` without token → 401; with token
→ 200.

Worker deleted after the note was drafted (`wrangler delete -c wrangler.exp.jsonc --force`).
Config + `/exp` routes stay as protocol docs.

## Verdict

**Fork: units.** 4/50 OOMs on the cheap-surface union is enough. A
single 255 MB-local program is not a production check. Server unit,
snapshot emit, and client-vs-snapshot each 0/50 — those three units
are the architecture decision 8 already wrote down locally.

Control union 0/50 at 340 local **recalibrates** the old 330-local →
~36% OOM mapping for this throwaway worker. The tail was not stuck
open: the same session recorded the four cheap-union kills. Do not
read 0/50 on today's union as "the live factory is fine" — that was a
different worker and date.

## Does not imply

- Live `sfab-lite-check` OOM rate (this was `sfab-lite-check-exp`).
- That accumulating emit's `typeToString` snapshot is product-quality
  (local round already proved the pretty printer; prod only counted
  isolate death).
- That 0/50 is a 0% rate. Rule of three: likely under ~6%. Enough for
  the written gate; not a reason to skip units.
- Component-layer snapshot lever — unactivated; client unit 0/50.

## Follow-ups

PR 2: restructure + universe-pins inversion + direction gate, now
against **units**, not a single cheap-surface program. Snapshot regen
stays a separate pass / per-module. Client minify remains a later
prebuild PR.
