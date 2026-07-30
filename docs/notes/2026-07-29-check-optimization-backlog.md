# Check optimization backlog (2026-07-29)

Non-authoritative. Distilled from the manager-packet exploration
`2026-07-29-check-speed-checker.md` before that packet was archived.
Authoritative rejections and memory constraints stay in
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).

## Context

Production typecheck wall time (~11–20 s) is dominated by **full cold
LanguageService construction + full semantic pass** on every factory → check
service-binding call (`lsReused` is false in practice — no isolate affinity).
CheckDO / keep-alive-as-the-answer are measured and rejected; see
`making-it-fit.md`.

## Ranked next bets

Tags: **C** = cheaper cold · **W** = warm / reuse · **S** = fewer redundant checks.

| Rank | Experiment | Tag | Expected impact | Risk |
| ---: | --- | --- | --- | --- |
| 1 | Resume ADR-0004 / trim **checked** generics (`@base-ui/react`, kysely, better-auth closure) | C | High (heap + semantic work) | Medium |
| 2 | Affected-file semantic pass when `bumpedFiles` ≪ roots (and LS warm) | C (+W) | Medium–high on agent loop; zero on prod cold | Medium |
| 3 | Factory **tree-hash skip** for agent typecheck (**never** CD / publish) | S | High during check storms | Low–medium |
| 4 | Protected `/check` default `forceCold: false` (was cold-unless-false) | W | Low in prod; useful warm/local | Low |
| 5 | Keep-alive ping spike | W | Likely none for template size | Low — falsify fast |
| 6 | Narrow `AppType` client↔server `import type` link | C | High for client-heavy checks | High |
| 7 | Phase timing via tail / external wall (in-worker timers clamped) | — | Enables prioritization | Low |

**Do not re-derive:** CheckDO affinity, bigger Worker, prune never-opened VFS
files, `lib.dom` trim, icon barrel collapse, TS7/tsgo pin change — all in the
`making-it-fit.md` rejected table.

## Wiring notes (as of exploration)

| Call site | `forceCold` | Notes |
| --- | --- | --- |
| CD `callCheck` | default false | Incremental *if* isolate retains LS |
| Create / seed | true | Correct cold baseline |
| Protected `/check` | cold unless body sets false | Flip candidate (rank 4) |
| Agent `pnpm typecheck` | false | Still cold in prod without affinity |

CD order remains lint → compile → check. Publish / CD paths must always run
the full gate even if agent typecheck gains a tree-hash skip.
