# Forge + code host — plan

Sharpen closed 2026-07-29. Packet-local (sfab-lite not platform-linked).

**Tasks:** `tasks/` — [LITE-FORGE](tasks/LITE-FORGE.md) parent;
[LITE-FORGE-1](tasks/LITE-FORGE-1-code-host-foundation.md) foundation
(in progress); [LITE-FORGE-2](tasks/LITE-FORGE-2-forge-collaboration.md)
collaboration (blocked on 1).

## Understanding

**Product:** GitHub-like loop for each lite app — repo, workspace, bash
CLIs, commit → PR → checks → merge → live deployment. No containers/VMs.

**Engineering:** **Code host** stores Git (R2 stand-in now; **Cloudflare
Artifacts** adapter later). **Forge** is our PR/checks/merge layer. CD
produces immutable **builds** keyed by sha; a thin **live** pointer is
what serve reads. AppDO = runtime SQLite, not code history.

## Glossary (locked)

| Concept | Name | Notes |
| --- | --- | --- |
| CF Git product | **Cloudflare Artifacts** | Vendor only — never our product noun |
| Port over CF / stand-in | **code host** (`CodeHost`) | |
| Per-app Git repository | **repo** | |
| PR + checks + merge layer | **forge** | Architecture / internal; UI can say PRs, Checks, etc. |
| Immutable compile output for a commit | **build** | Keyed by sha — not “artifact” |
| Production serves this sha | **live** / **live deployment** | Thin pointer — not “live version” |
| Serve a PR head | **preview** / **preview deployment** | |
| Platform CI | **checks** / **runs** | Actions-like UI ok |
| Agent checkout | **workspace** | |
| Runtime SQLite DO | **AppDO** | Not a code store |

**Rule:** if Cloudflare owns the word, we don’t use it for our concepts
(except naming their product). **Forge** stays as our umbrella name.

## Settled

| Decision | Choice |
| --- | --- |
| Posture | Repo via code host is code SoT; snapshot-publish is legacy |
| AppDO | Runtime SQLite only. Code history leaves |
| Tokens | Platform auto-mints/injects; never an agent tool |
| Agent runtime | Think file tools + bash — no VMs; **no codemode agent UX** |
| Git surface | Bash `git` customCommands (`createGit` under the hood) |
| PR model | Branch PRs in **one repo per app** (`feature/*` → `main`) |
| Checks | Platform-fixed CI/CD; GitHub-like UI; agent via virtual `gh` |
| Agent CLI UX | Bash-first: virtual `gh` + mocked `pnpm`/`npm` |
| Unsupported CLIs | Honest fail (e.g. `pnpm install`) with clear stderr |
| Bash injection | just-bash → `workspaceBash.customCommands` (+ Think patch) |
| Virtual `gh` v1 | `run list\|view\|watch\|rerun`, `pr list\|view\|checks\|create\|diff\|merge` |
| Template | Current seed first; starter-shaped reshape later |
| Cutover | **Greenfield** wipe — no data migration |
| Code host | Working R2 stand-in now; Cloudflare Artifacts adapter when enrolled |
| Naming | Glossary above — keep **forge** |
| Architecture | Repo SoT → CD **builds** by sha (R2) → thin **live** on D1; ship via merge |
| Live pointer | **D1 app row** (`live_sha`); builds on R2 |
| LITE-FORGE-1 CD | Minimal — create + `main` tip → build → `live_sha` |
| LITE-FORGE-2 merge | **`main` merge-only**; humans + agents may merge; `gh pr merge` |
| Code-host stand-in | **R2** bare repos |

## Target architecture (locked)

| Layer | Job |
| --- | --- |
| **Repo** via **code host** | Only code SoT |
| **Forge** | PRs, checks UI, merge |
| **CD** | On `main` / PR heads: lint → compile → schema gate → write **build** for sha |
| **Build store** | Bundles keyed by `appId + sha` (R2) |
| **Live pointer** | Thin: app → sha on **D1**; serve loads **build** from R2 |
| **AppDO** | Runtime SQLite + migrations only |
| **Agent** | workspace + `git` / `gh`; ship by merge to `main` |

## Seam (`CodeHost`)

- `ensureRepo(appId)` → remote identity / clone URL
- `credentialsForAgent(appId)` → injected auth (never a tool)
- clone/push/pull via bash `git` → isomorphic-git → that remote

| Adapter | When |
| --- | --- |
| Stand-in: isomorphic-git + **R2** bare repos | Now |
| Cloudflare Artifacts | When enrolled — replace adapter only |

## Already merged (not in scope)

| PR | What |
| --- | --- |
| #92 | Org events bus |
| #93 | Preview + workspace code panel |
| #94 | Agent system prompt sharpen |

## Delivery (local tasks)

1. **LITE-FORGE-1** — Code host + wipe + minimal CD (`feat/code-host-foundation`)
2. **LITE-FORGE-2** — Forge collaboration (after 1)
3. Later: CF Artifacts adapter; template reshape

## Non-goals (v1)

- Containers / VMs as agent runtime
- Codemode / `gitTools` as agent UX
- Fork-per-run PR model
- User-authored workflows in-repo
- Historical AppDO version migration
- Blocking on Cloudflare Artifacts beta
- Calling our concepts “Artifacts”

## Wipe inventory (explored)

Remove: `_sfab_versions` / `_sfab_live` / `_sfab_commit_attempts`, commit-as-version,
revert, versions UI, seed-from-live, `liveVersionId` as code SoT.

Keep/rewire: AppDO runtime SQL, serve loader, compile/check/lint,
AppAgent workspace, TEMPLATE_SEED as initial **repo** content, kernel R2.

## Order

1. LITE-FORGE-1 → 2. LITE-FORGE-2 → 3. CF Artifacts adapter → 4. Template  

CF Artifacts access (parallel): https://forms.gle/DwBoPRa3CWQ8ajFp7
