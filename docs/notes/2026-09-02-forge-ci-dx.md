# 2026-09-02 — Forge CI DX

**Status:** adopted (AC-5)
**Locked calls:** packet D-013; forge note
[`2026-07-29-forge-code-host.md`](./2026-07-29-forge-code-host.md);
PLAN-alw-860 §9.

Non-authoritative working note. Product nouns stay **code host / repo /
build / forge**.

## Context

Cloudflare's CI story: `git push` → `cf.artifacts.repo.pushed` → one
platform-owned TypeScript `CIWorkflow` → parallel lint/typecheck/test/build
in `ci.runner()` **Containers** → fail-closed deploy → per-step logs.

We copy the **shape**, not the runners. Live forge pipeline is
`forge/cd.ts`. Stages are named `CdStages`; per-run timings go through
`stagesLogLine`. Feature-branch pushes hit in-process `onBranchPushed`.
Check / lint / build stay isolate **Workers**.

## Copied vs kept

| CF | We do |
| --- | --- |
| One pipeline for every repo in the namespace | One forge pipeline for every lite app (`forge/cd.ts`) |
| TypeScript stages, not YAML | Keep / name `CdStages` as the pipeline |
| Parallel checks | Lint ∥ check ∥ compile where isolates allow; fail-closed before `live_sha` |
| Per-step logs | Keep `stagesLogLine` / check UI timings |
| `ci.runner()` Containers | **Keep** check / lint / build **Workers** |
| `cf.artifacts.repo.pushed` Workflow | **Keep** in-process `onBranchPushed` (external git push is not a v1 flow) |

## Does not imply

No Workflow binding, no `@cloudflare/ci` dependency, no Container sandbox
in this work. Adopting their runners is a later measured call (M3 cost
bar).

## Follow-ups

Artifacts probe, then `createCodeHost` cutover. This note is the AC-5
deliverable; it does not change CD, merge, or serve.
