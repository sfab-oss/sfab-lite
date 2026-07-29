# 2026-07-28 — factory org events bus (invalidate + preview reload)

Non-authoritative working note from a sharpening session. If this disagrees
with an ADR or the code, those win.

## Understanding

**Product:** Factory clients stay fresh when another writer (UI, HTTP, MCP)
changes the apps list, an app factory record, or a live version; factory
preview shells can reload on deploy. Lite apps on their own origin do not
auto-refresh in day-to-day use.

**Engineering:** Org-scoped Durable Object pub/sub over hibernatable
WebSockets; explicit publish after successful writes; React Query
invalidation + preview `liveVersionId` handling on the client.

## Settled decisions

| Decision | Choice |
| --- | --- |
| Home | sfab-lite factory (`apps/factory`) |
| DO grain | Org-scoped (`idFromName(organizationId)`), not `AppDO` / `AppAgent` |
| Generality | Generic hint bus; custom clients. Factory-only in v1; contract reusable later |
| Deploy refresh | Factory preview only — not live app origin. Surfaces: chat `SessionTabBrowser` **and** a **factory console iframe route** (not bare `/a/:appId/preview`). Shared reload helper on `app_live_version_changed`. |
| Publish | Explicit `publishOrgEvent` after successful shared choke points — not AppDO SQL CDC, not MCP wrappers, not on 202 |
| Auth | better-auth session cookie on same-origin WS upgrade; `getSession` + membership (tenancy spirit) |
| Envelope | Merged three-lens probe; topics renamed for clarity (below) |
| Topics | `app_list_changed` / `app_record_changed` / `app_live_version_changed` |
| Create pass | Emit **both** `app_list_changed` + `app_live_version_changed` |
| Attempt topic | Deferred; polling may cover attempt UI in v1 |

## Wire contract (locked)

```json
{
  "v": 1,
  "kind": "event",
  "seq": 1842,
  "id": "evt_…",
  "topic": "app_live_version_changed",
  "payload": { "appId": "…", "liveVersionId": "…" }
}
```

- `kind` = frame type (`event` / `sync` / `resync`)
- `topic` = closed set below
- DO stamps `seq` / `id`; gap → client HTTP resync; no event log
- No RQ keys, entity snapshots, or reload directives on the wire

### Topics → publishers → client reactions

| Topic | Payload | Publish when | Client |
| --- | --- | --- | --- |
| `app_list_changed` | optional `appId` | create settle (pass/fail), delete | Invalidate `["apps"]` — no preview reload |
| `app_record_changed` | `appId` | rename (factory record fields) | Invalidate `["apps", appId]` + `["apps"]` — no preview reload |
| `app_live_version_changed` | `appId`, `liveVersionId` | deploy/commit pass, revert, create pass | Invalidate versions; attended `refreshApp`; matching preview iframes reload |

Exploration trail:
`active/sfab-lite/artifacts/explorations/org-events-envelope-{publisher,client,transport,synthesis}.md`

## Must-haves / non-goals

**Must:** org DO + authenticated factory WS; publish on list/record/live
success paths; factory RQ invalidation; preview reload on
`app_live_version_changed` for chat preview and factory console iframe route.

**Non-goals:** live-app-origin auto-refresh; shared package extract in v1;
AppDO sockets; DO event replay; server-side topic subscription filters;
bus client injected into serve `preview` mode.

## Still open (implementation, not product)

1. How `organizationId` is resolved inside async `runCommitAttempt` for
   publish (registry read vs metadata on AppDO).
2. Exact factory console preview route path (fit existing router).
3. Branch / PR from this brief when implementation starts.

## Sharpen status

**Closed 2026-07-28** — shared understanding confirmed. Next: implement from
this note (org DO + WS + publish choke points + `OrgEventsRouter` + chat
preview + factory iframe preview route).
