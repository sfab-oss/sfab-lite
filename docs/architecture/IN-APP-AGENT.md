# In-app agent

**Status:** Design — not built. ADR-0003's "decide when agent work
starts" check-in is this document. No ADR yet: a later milestone
starts the build, and the first measurements below can still flip
transport. Authoritative for the four answers; the direction note
stays a working note.

Direction:
[`../notes/2026-08-12-lite-evolution-direction.md`](../notes/2026-08-12-lite-evolution-direction.md)
(decision 5, milestone item 7). Names:
[`../engineering/terminology.md`](../engineering/terminology.md).
Surfaces:
[`../engineering/agent-surfaces.md`](../engineering/agent-surfaces.md).
Constraints:
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).

## Owner decisions

Flip any of these; everything else in this file follows.

| # | Pick | Alternative |
| --- | --- | --- |
| 1. Tenancy | One agent surface per **serve target**; **app threads** per **app user** | One Durable Object per app, per app-org, or per app-user |
| 2. State | App-thread rows in that target's **AppDataDO** (app schema) | A dedicated agent Durable Object, or factory D1 |
| 3. Transport | **In-process**: agent is app server code; tools call `app.request` | RPC from a sibling isolate / dedicated DO into the served app |
| 4. Memory | **Per-app-thread history only**; tools read live app data | Durable per-user memory besides the app thread |
| 5. Manifest | `capabilities` may include `"agent"` | No declaration (code presence only), or a catalog module |

## 1. What it is

An end user of a **served app** talks to an agent that belongs to
that app. The agent has tools over that app's routes and data, under
that user's **app** session (better-auth in the app, including the
app organization). It ships in the app image as ordinary `src/`
server code plus ordinary migrations. It is a serve-plane feature.

## What it is not

It is not the develop-plane workspace agent (`AppAgent` /
`AppThread`: one Think Durable Object per workspace, console
thread, single `execute` tool). It is not MCP (named factory tools).
It is not write-actions or confirmation UX (named non-goals for this
milestone). It is not a build plan.

## 2. The four answers

### Tenancy

**Decision.** One agent *surface* per serve target — the same
cardinality as AppDataDO (`${appId}:live`, `${appId}:pr:N`,
`${workspaceId}:ws`). Many **app threads** per **app user** inside
that store. App organizations do not get their own agent isolate: tool
calls go through the app's existing org-scoped routes, so the
session's active app org is the data scope.

**Why.** The served app is already tenancy-shaped that way: live is
public at the host layer and the app's own auth applies inside;
preview is empty+migrations, never a live clone
([`OVERVIEW.md`](OVERVIEW.md)). A second tenancy key (factory org,
per-user Durable Object, per app-org isolate) would duplicate what
better-auth and AppDataDO already do. App threads are the chat unit
([`terminology.md`](../engineering/terminology.md)); session stays
an auth word. Factory Thread is the workspace chat — different plane.

**Citation.** Bounding per-app state to exactly one app
([making-it-fit](../engineering/making-it-fit.md) technique 3) —
don't keep N residents where one target's store already isolates.
Preview isolation:
[`../notes/2026-07-29-preview-isolation-greenfield.md`](../notes/2026-07-29-preview-isolation-greenfield.md).

**What would change it.** If app-org data must not share a SQLite
file even under row-level org filters (a bar we do not have), split
AppDataDO per app-org — that would be an app-data change, not an
agent-only one.

Rejected: one Durable Object per app (ignores preview/workspace
pairs already in `serve-target.ts`). One DO per app-user (N isolates
per app; CheckDO-class cost with no warmth —
[making-it-fit](../engineering/making-it-fit.md), DO idle retention
~30s). Factory-org tenancy (wrong plane: factory auth is not app
auth).

### State location

**Decision.** Conversation history lives in the app's own AppDataDO
SQLite as ordinary drizzle tables, migrated with the app, packed in
the image's migration list, ejected with the app tree.

**Why.** [ADR-0005](../decisions/0005-app-loop-mimics-an-ordinary-repo.md):
an ejected app should keep behaving like an ordinary repo. App
threads are app data. AppDataDO is already "runtime SQLite only"
(`app-data-do.ts`); factory D1 is "no app data here"
(`wrangler.jsonc`). A dedicated agent Durable Object is a second
store to eject, migrate, and isolate — the design that adds a
component.

**Citation.** [ADR-0005](../decisions/0005-app-loop-mimics-an-ordinary-repo.md);
[ADR-0001](../decisions/0001-edge-native-lite-architecture.md) (apps
are data; factory is ordinary software). Image v0 already carries
`migrations` ([APP-FORMAT §6](APP-FORMAT.md)). DO SQLite size and
growth per app thread are **unmeasured** — see §4.

**What would change it.** If packing app-thread tables into the app
schema makes check-unit heap or AppDataDO growth fail a later
production tail, revisit. That is a measurement, not a preference.

Rejected: dedicated per-app agent Durable Object (second class,
second isolate, ejects as a host secret). Factory D1 (does not
eject; wrong tenancy; `wrangler.jsonc` forbids app data there).

### Agent↔app tool transport

**Decision.** In-process. The agent is compiled into the same
LOADER child as the Hono `app` export. Tools call that app the way
a test does: `app.request(...)` with the end user's session
forwarded. No second copy of the app, no sibling isolate.

**Why.** Serve already loads **one** image into **one** LOADER
worker keyed by serve target + build sha (`serve.ts`). A second
worker would be a second copy of `build.serverBundle` — forbidden
by "host serves only from images"
([direction item 6](../notes/2026-08-12-lite-evolution-direction.md),
[APP-FORMAT §6](APP-FORMAT.md)). The develop-plane agent already
proved the other shape is worse: a Durable Object cannot construct
the LOADER child itself, so `AppAgent` reaches the served app over
the `SELF` loopback (`wrangler.jsonc`). The served-app agent *is*
inside that child; repeating the loopback would add a hop the
isolate already does not need. Direct drizzle from the agent would
bypass app auth — tools go through Hono so org and session checks
stay one code path.

Think (`@cloudflare/think`) is a Durable Object class used by
`AppAgent` / `AppThread`. A LOADER child is a Worker Loader
isolate with no `ctx.storage` of its own (DB is the AppDataDO
stub). Do not put Think in the child.

**Citation.** Isolate memory **128 MB, every plan, no knob**; no
isolate affinity; Durable Objects do not give more memory
([making-it-fit](../engineering/making-it-fit.md), "The limits we
actually run into"). CheckDO rejected on the same warmth curve.
Closed resolve: the model/agent SDK is not on `SERVER_IMPORT_MAP`
today (`served-specifiers.mjs`); it must be runtime-served before
build, or check fails `LITE-RESOLVE` ([APP-FORMAT §1](APP-FORMAT.md),
PR #132).

**What would change it.** A production tail showing the LOADER
child with the agent SDK over 128 MB
([making-it-fit](../engineering/making-it-fit.md): local workerd
applies no memory limit). Then — and only then — move the model
loop to a sibling isolate and RPC into Hono, accepting a second
component because the in-process pick physically does not fit.

Rejected: RPC from a dedicated agent DO (the develop-plane pattern;
adds a component; copies or remotes the app). Agent-owned drizzle
(shadow API, skips app auth). Shipping `@cloudflare/think` into the
app (wrong surface; not served; closed resolve).

### Memory posture

**Decision.** The agent remembers **this app thread's messages**.
It does not keep a durable per-user memory, embeddings, or a cached
copy of parties/balances/etc. Each turn, tools hit live routes.
App-thread rows are app data: they persist until the app user
deletes the app thread. No factory-side TTL.

**Why.** A second store of "what the agent knows about the business"
is a shadow copy of the app database — the thing ADR-0005 and
technique 3 exist to prevent. History is chat, not cache. Size caps
and retention windows are **unmeasured**; inventing them here would
violate the catalogue rule.

**Citation.** Technique 3 (one app's state, not N residents);
"Heap follows the semantic pass" / do not carry surface you are not
serving ([ADR-0004](../decisions/0004-trim-unreachable-vendor-surface.md)).
Model packages stay on the closed import map (closed resolve, PR
#132). Memory claims are verified in production, never under local
workerd ([making-it-fit](../engineering/making-it-fit.md) lessons).

**What would change it.** A measured product need for recall across
app threads that cannot be served by querying live app data. That is a
later milestone, with a cap.

Rejected: durable per-user memory (shadow copy). Prompt-stuffing the
whole app database (unbounded; fights the 128 MB ceiling).

## 3. How it fits the format

The agent is **app code**. It is not a second image, not a host
feature flag, not a check unit of its own.

| Layer | What it records |
| --- | --- |
| `manifest.capabilities` | May include `"agent"` — this app uses the runtime-served agent/model surface. Still a `string[]` of external-service tokens ([APP-FORMAT §3](APP-FORMAT.md)); the external part is the model. Empty stays the M1 value until the build milestone. |
| `manifest.modules` | Unused. Catalog modules do not exist. |
| App source | Agent routes/UI under `src/` (Hono + client), same layout rules as any feature. |
| Image v0 | Already snapshots the whole manifest, the server bundle, and migration names. Agent tables are migrations; agent code is in `server`. No extra image field. |
| Check | Same units as today (server → emit → client). No agent unit unless a later heap measure says the SDK must be severed the way `api.d.ts` severs the server. |

`capabilities: ["agent"]` is a declaration, not an implementation.
The runtime must serve the SDK (closed resolve) and the host must
pass a model binding into the LOADER env (today: `DB`, auth, seed
token — `serve.ts`). Those are build-milestone host/runtime work.

## 4. What must be true before build

Numbered. No architecture is adopted on local heap alone
([making-it-fit](../engineering/making-it-fit.md)).

1. **LOADER-child heap with the agent SDK** — production tail of
   serve (not check) with the runtime-served model package inside
   the child. Local workerd is not a claim. If this OOMs, transport
   flips to RPC (§2).
2. **Check-unit heap** — `measure:units` server/client with the
   agent SDK on the import map and a starter-sized agent route.
   Product-path server is already **243 MB** local
   ([`../notes/2026-08-14-pr8-starter-rebuild-check.md`](../notes/2026-08-14-pr8-starter-rebuild-check.md));
   adding surface needs a number, then a live re-tail.
3. **Runtime surface** — which specifiers are added to
   `SERVER_IMPORT_MAP` (and client, if the chat UI needs them).
   Closed resolve applies; `@cloudflare/think` is not a candidate
   (wrong plane). Upload bytes vs the 10 MB gzip cap
   ([making-it-fit](../engineering/making-it-fit.md) limits table)
   if the SDK lands in a factory/kernel bundle.
4. **AppDataDO growth per app thread** — bytes per message, per app thread,
   on a real serve target. No size number exists in the catalogue;
   do not ship unbounded history on a guess.
5. **Cost per app** — still the direction note's open item (create
   + N check cycles + serve, in dollars). The agent adds model
   tokens on the serve plane; include those in the figure that
   gates scale-out.
6. **Read-only tool set** — first build tools are GETs through
   existing app routes. Writes and confirmation UX stay the named
   non-goal until that product pass exists.

## 5. No ADR yet

The four answers are the design. They are not yet irreversible: (1)
and (3) in §4 can still flip transport and therefore state. An ADR
lands when the build milestone starts with those measurements in
hand. [ADR-0003](../decisions/0003-deferred-domain-tasks-agent.md)
recorded the deferral; this file is the check-in it named. The
*build* remains deferred.

## Related

- [`APP-FORMAT.md`](APP-FORMAT.md) — image, capabilities, check units
- [`OVERVIEW.md`](OVERVIEW.md) — serve targets, AppDataDO, LOADER
- [`../engineering/agent-surfaces.md`](../engineering/agent-surfaces.md)
- [`../decisions/0001-edge-native-lite-architecture.md`](../decisions/0001-edge-native-lite-architecture.md)
- [`../decisions/0005-app-loop-mimics-an-ordinary-repo.md`](../decisions/0005-app-loop-mimics-an-ordinary-repo.md)
