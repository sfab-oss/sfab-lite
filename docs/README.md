# sfab-lite docs

In-repo engineering docs (PR-authored, reviewed like code). Knowledge lives
with the code under `docs/`.

**Lite** means the hosted template / frozen-kernel sub-apps — not skimpy
factory tooling or documentation. This tree is for the experiment's
architecture, decisions, and measured constraints — not operator manuals.

## Map

| Path | Authority | Purpose |
| --- | --- | --- |
| [`architecture/`](architecture/) | Authoritative | Settled system shape (do not relitigate without an ADR) |
| [`architecture/APP-FORMAT.md`](architecture/APP-FORMAT.md) | Authoritative (RFC) | App layout, manifest v0, generated members, check units, adapter shape |
| [`architecture/IN-APP-AGENT.md`](architecture/IN-APP-AGENT.md) | Authoritative (design) | Served-app agent: tenancy, state, transport, memory. Not built. |
| [`decisions/`](decisions/) | Authoritative | ADRs — costly, cross-cutting choices among real alternatives |
| [`engineering/`](engineering/) | Authoritative | Living technique guides — how we work within the platform's limits |
| [`engineering/DEPLOY.md`](engineering/DEPLOY.md) | Authoritative | Deploy prerequisites — secrets, the shared `ADMIN_TOKEN`, the health check that proves them |
| [`engineering/terminology.md`](engineering/terminology.md) | Authoritative | Two planes, reserved words, forge glossary |
| [`engineering/agent-surfaces.md`](engineering/agent-surfaces.md) | Authoritative | MCP vs develop-plane `execute` vs served-app agent — what transfers |
| [`notes/`](notes/) | Non-authoritative | In-flight working notes; graduate or delete |

Start with
[`engineering/making-it-fit.md`](engineering/making-it-fit.md) before proposing
a fix for a memory, bundle-size or latency problem. Several attractive ideas
are already refuted there with measurements, and re-deriving them is expensive.

House rules for agents also live in [`../AGENTS.md`](../AGENTS.md).

## Not in this tree

- A separate public docs site (`apps/docs`) — there is none; engineering docs
  here are the surface.
- Engineering smell/structure guides — `docs/engineering/` holds
  platform-constraint technique; add smell/structure guides alongside it when
  the codebase is thick enough to need them.
