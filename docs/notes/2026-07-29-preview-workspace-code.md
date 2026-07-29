# 2026-07-29 — factory preview + workspace code panel

Non-authoritative working note from a sharpening session. If this disagrees
with an ADR or the code, those win. Org-events bus PR #92 is separate (draft).

## Understanding

**Product:** On `/apps/$appId/preview`, optionally show WIP code beside the
live iframe; code updates as agent/MCP edits arrive. Preview still auto-reloads
on deploy via the org-events bus.

**Engineering:** Header Code toggle → resizable split (desktop) or surface
swap (mobile). Workspace via AppAgent while Code is on. Shared tree/viewer
extracted from chat patterns; not `SessionTabFiles` as-is.

## Settled decisions

| Decision | Choice |
| --- | --- |
| Code surface | Agent workspace (WIP), not live published sources |
| Preview surface | Existing factory console iframe route |
| Live iframe reload | Keep org-events `app_live_version_changed` |
| Panel UX | Header **Code** toggle; default off; `localStorage` (browser-wide) |
| Workspace data | AppAgent while Code on — RPC + `workspace-change`; no new HTTP API; no chat required |
| Shipping | Follow-up PR separate from #92 |
| Mobile | Toggle swaps preview ↔ code |
| File UI | Extract shared tree/viewer + workspace hook; chat migrate later optional |
| Refresh | Tree + re-read open file; clear if path gone; no live cursors/partial diffs |
| Banner | Static strip when Code on: workspace WIP vs live until deploy |

## Must-haves / non-goals

**Must:** toggle + split/swap; AppAgent workspace tree/viewer; live updates on
`workspace-change`; static WIP banner; keep deploy iframe reload.

**Non-goals:** editing in the panel; dirty-vs-live detection; collaborative
cursors; new HTTP workspace API; injecting bus into serve `/a/...`; mixing
into PR #92; migrating chat Files in the same PR (optional later).

## Still open (implementation)

1. Exact AppAgent RPC surface for list/read (mirror MCP/`readFile` patterns).
2. Whether to share an existing chat AppAgent socket when both are open.
3. Branch: stack on `feat/org-events-bus` vs wait for #92 merge to `main`.

## Sharpen status

**Closed 2026-07-29** — shared understanding confirmed. Next: implement as
follow-up PR (not #92).
