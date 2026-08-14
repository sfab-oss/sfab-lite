# 2026-08-14 — Live factory OOM baseline

Non-authoritative (see [`README.md`](README.md)). Catalogue:
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).
Priors: [`2026-07-25-check-worker-memory.md`](2026-07-25-check-worker-memory.md)
(36% / 4 of 11 check calls on live create),
[`2026-08-13-prod-tail-matrix.md`](2026-08-13-prod-tail-matrix.md)
(throwaway worker, not this one).

**Status:** live done; **0/8 creates OOM**. Today's live `sfab-lite-check`
did not reproduce the historical ~1-in-4.
**Hypothesis:** eight sequential creates through the live factory, counted
by `exceededMemory` on a websocket tail of `sfab-lite-check`. Zero OOMs
in this sample = the current live rate is not the 2026-07 rate.

## How to re-run

Read-only tails (no deploys). From `apps/check`, with a Cloudflare API
token that can tail workers:

```bash
node scripts/watch-tail.mjs --worker sfab-lite-check --out /tmp/check-tail
node scripts/watch-tail.mjs --worker sfab-lite-factory --out /tmp/factory-tail
```

Creates go through `https://lite.sfab.dev/api/protected/apps` with
`X-Admin-Token` (factory `ADMIN_TOKEN`, identical on check and lint)
and `?organizationId=`. Python's default urllib User-Agent is **Cloudflare
1010** from this host; curl / a browser UA works. Sequential: wait until
each app is `ready` or `failed` (or 120s hung) before the next.

Do not `wrangler tail > file &` — it block-buffers. Heartbeats on the
websocket watcher must keep moving.

## What we ran

Host: `oracle-cool-big-child-1`, 2026-08-14. Live workers
`sfab-lite-check` and `sfab-lite-factory` (no config change, no code
deploy). Tails from 06:14:36Z; create window **06:48:06Z–07:01:07Z** UTC.
Org Canary. Eight apps `baseline-1`…`baseline-8`, then deleted.

Check tail (POST `/check` only; the 06:43 health GET is excluded):

| t (UTC) | outcome | wall ms | cpu ms | HTTP |
| --- | --- | ---: | ---: | ---: |
| 06:49:37 | ok | 10918 | 9460 | 200 |
| 06:51:15 | ok | 10999 | 9442 | 200 |
| 06:52:52 | ok | 10782 | 9469 | 200 |
| 06:54:28 | ok | 10622 | 9308 | 200 |
| 06:56:06 | ok | 10761 | 9322 | 200 |
| 06:57:45 | ok | 10909 | 9467 | 200 |
| 06:59:22 | ok | 13310 | 12070 | 200 |
| 07:01:03 | ok | 11877 | 10274 | 200 |

Factory UI/API outcomes: **8/8 `ready`**. Check calls: **8/8 `ok`**, **0
retries**, **0 `exceededMemory`**. Wall ~10.6–13.3 s (cpu ~9.3–12.1 s).
Create-to-ready ~94–100 s for apps 2–8 (`baseline-1` was already in
flight when polling started, 40 s remaining).

Factory tail in the same window also recorded many `ok` poll GETs from
the waiter and 15 `canceled` — not check OOMs; do not mix them into the
rate.

## Verdict

**Live create OOM rate in this sample is 0/8**, not ~1-in-4. Eight
creates is the same n as the 2026-07-25 baseline (that one had 4 OOM on
11 check calls because of retries). A 0/8 observation does not prove the
true rate is zero — the 95% upper bound is still roughly 30% — but it
does mean **do not cite 1-in-4 as the current live rate**. The AppDO-alarm
retry (technique 6) was not observed firing; every create passed check
first try.

The throwaway-worker 340-local 0/50 (2026-08-13) is consistent with this
live sample and still does not replace it.

## Does not imply

- That the 128 MB cap is gone, or that local 340 MB is safe.
- That cheap-union 255 MB would pass here (that program OOMed 4/50 on
  the throwaway worker).
- Permission to skip units architecture. This is a before number for
  the rollout, not a reason to keep today's union.

## Follow-ups

- Keep this as the before/after for Milestone 1. Re-tail after the
  units worker ships, same 8-create protocol.
- Factory `canceled` 15 during polling is unexplained; not this lane.
