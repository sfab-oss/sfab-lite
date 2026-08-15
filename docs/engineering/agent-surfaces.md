# Agent surfaces

Lasting constraint graduated from the 2026-07-28 MCP handoff. Do not
conflate these surfaces when diagnosing "the agent" or when improving
tools. This file used to call the console thread "the in-app agent";
that name now belongs to the served-app agent.

## Three surfaces

| Surface | Who talks to it | Shape |
| --- | --- | --- |
| **MCP** (`/mcp`, `factory/host/src/mcp/`) | Humans / outer agents driving the **factory** | Named tools — apps lifecycle, workspace FS, `bash`, … |
| **Develop-plane agent** (console thread) | Factory user, against a **workspace** | **One** tool — code-mode `execute` (`@cloudflare/think`). `AppThread` facet of `AppAgent`. Writes TypeScript against a `state` backend / shell; it does not call the MCP tool names. |
| **In-app agent** (served app) | End user of a **served app**, over that app's data | Design only: [`../architecture/IN-APP-AGENT.md`](../architecture/IN-APP-AGENT.md). Not MCP, not `execute`, not built. |

MCP exists so humans and outer agents can drive the factory at wire
speed (create → edit → check → ship) and surface **platform** gaps
without a browser loop. It is not a substitute for the develop-plane
agent, and neither factory surface is the in-app agent.

## What transfers (MCP ↔ develop-plane)

- **Platform gaps transfer.** Deploy that refuses a valid schema,
  diagnostics that hide the real error, missing host capability —
  same underlying code paths the develop-plane agent eventually
  bottoms out in. Fix once; both improve.
- **Tool-ergonomics gaps do not.** Unclear MCP descriptions, "needed
  three calls for one thing", OAuth consent friction — the
  develop-plane agent never sees those tools. Do not rewrite it from
  MCP UX complaints alone.

When recording a finding against those two, label it **platform** or
**ergonomics**. Findings against the in-app agent are **app** findings
(routes, app auth, app data) — a different plane.

## Related

- [`../architecture/OVERVIEW.md`](../architecture/OVERVIEW.md) — host / check / lint
- [`../architecture/IN-APP-AGENT.md`](../architecture/IN-APP-AGENT.md) — served-app agent design
- [`terminology.md`](terminology.md) — Thread vs session; workspace naming
- [`../notes/2026-07-29-forge-code-host.md`](../notes/2026-07-29-forge-code-host.md) — agent ships via git / forge, not snapshot publish
