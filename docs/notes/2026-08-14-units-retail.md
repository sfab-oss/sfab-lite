# 2026-08-14 — Units re-tail (checkpoint after PR #134)

Non-authoritative (see [`README.md`](README.md)). Catalogue:
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).
Before-number:
[`2026-08-14-live-factory-baseline.md`](2026-08-14-live-factory-baseline.md)
(0/8 on the fused-union worker). Architecture under test: the
three-unit check run of
[`../architecture/APP-FORMAT.md`](../architecture/APP-FORMAT.md) §5,
live since PR #134 deployed.

**Status:** live done; **0/8 creates OOM, 0 retries, 8/8 ready.**
**Hypothesis:** the same 8-create protocol as the baseline, against the
deployed units worker, matches or beats the union's 0/8 — despite the
product-path local numbers (244/250/372 MB per unit) coming in far
above the isolated-experiment predictions (93/146/147–175).

## What we ran

Host: `oracle-cool-big-child-1`, 2026-08-14. Live `sfab-lite-check`
(script version cf8744b8, the PR #134 deploy) and `sfab-lite-factory` —
no config change beyond the merged deploy. Websocket tails from
13:51:36Z; create window **13:53:31Z–14:10:44Z** UTC. Org Canary.
Eight apps `retail-1`…`retail-8`, sequential (wait for
`ready`/`failed` before the next), then deleted (8/8 delete 200,
list shows none remaining).

Check tail (POST `/check` only):

| t (UTC) | outcome | wall ms | cpu ms | HTTP |
| --- | --- | ---: | ---: | ---: |
| 13:55:31 | ok | 19066 | 16802 | 200 |
| 13:57:31 | ok | 18199 | 14541 | 200 |
| 13:59:28 | ok | 17009 | 13879 | 200 |
| 14:01:30 | ok | 17319 | 14154 | 200 |
| 14:04:27 | ok | 45612 | 32684 | 200 |
| 14:06:33 | ok | 19519 | 15939 | 200 |
| 14:08:37 | ok | 17731 | 14764 | 200 |
| 14:10:41 | ok | 17028 | 14204 | 200 |

Factory outcomes: **8/8 `ready`**, create-to-ready ~117–125 s (one
178 s: `retail-5`, whose check is the 45.6 s wall outlier — still
`ok`, still one attempt). Check calls: **8/8 `ok`, 0 retries, 0
`exceededMemory`** — eight tail events for eight creates, so
`CHECK_ATTEMPTS` never needed its second try.

## Verdict — checkpoint 3

**The units architecture holds in production: 0/8 OOM, same as the
union's baseline.** The before/after pair is clean: same protocol,
same org, same n, opposite ends of the rollout.

Costs, named:

- **Wall per check roughly +60%**: units 17.0–19.5 s (one 45.6 s
  outlier, plausibly a cold isolate paying full-tree emit) vs the
  union baseline's 10.6–13.3 s. Three programs constructed and
  disposed instead of one. Create-to-ready moved ~94–100 s → ~117–125
  s. No one waits on check latency today in the create loop's UX, but
  this is the number to watch when checks move into the edit loop.
- The product-path local heap (244/250/372 MB sampled while each
  unit's LanguageService is live) did **not** stop the 128 MB isolate
  from passing — consistent with every prior observation that local
  Node heap has no stable mapping onto prod isolate behavior. Units
  each stay below the union's local mark, and prod tolerated the
  union too.

## Does not imply

- That the true OOM rate is zero — n=8; the 95% upper bound is
  roughly 30%, exactly as it was for the baseline.
- That the 45.6 s outlier is understood. One occurrence; if the edit
  loop later meets long tails, measure cold-isolate emit cost before
  guessing.
- That root policy is settled. The server/client units check every
  file (the worker's contract), not entry closures (the experiments').
  If a future recipe-heavy app OOMs, the named levers are root policy
  and the plan's deferred component-layer snapshot — in that order.

## Follow-ups

- This is Milestone 1's after-number. Re-tail again only when the
  check path changes materially (registry recipes growing the checked
  surface is the next candidate, PR 7–8).
- Wall-time watch: if checks enter an interactive loop, the +60% and
  the cold outlier become UX numbers, not curiosities.
