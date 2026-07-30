# 2026-07-30 — App-level isolated workspaces

Non-authoritative working note. Packet: `/workspace/active/app-workspaces/`.  
No platform task for sfab-lite (owner choice).

## Ask

Per-app **workspaces** as isolated “computers” (checkout + chats + WIP), not tied to a git branch. IDE-directory mental model; branch switch stays inside a workspace. App-level list + default; open → work view.

## Settled (milestone A)

See packet `PLAN.md`. Summary: workspace-keyed agent identity (clean slate), Default auto-created on app create, Workspaces tab, workspace-scoped work URLs, Overview → default work, remove Code CTA, Live stays app-level. Second workspace = slice B.

## Docs/code read

- Today: one `AppAgent` per `appId` = one shared Workspace FS; `checkoutBranch` switches HEAD; threads app-scoped; browser = WIP; Files/Live = published tip.
- Contradiction resolved: workspace ≠ branch; multi-workspace = N isolated runtimes per app.

## Next

Implement in `active/app-workspaces/worktrees/sfab-lite` on `feat/app-workspaces`.
