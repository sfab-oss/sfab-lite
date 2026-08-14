# Agent surfaces — MCP vs in-app

Lasting constraint graduated from the 2026-07-28 MCP handoff. Do not conflate
the two surfaces when diagnosing "the agent" or when improving tools.

## Two surfaces, one platform

| | Shape |
| --- | --- |
| **MCP** (`/mcp`, `factory/src/mcp/`) | Named tools — apps lifecycle, workspace FS, `bash`, … |
| **In-app agent** (console thread) | **One** tool — code-mode `execute` (`@cloudflare/think`). It writes TypeScript that runs against a `state` backend / shell; it does not call the MCP tool names. |

MCP exists so humans and outer agents can drive the factory at wire speed
(create → edit → check → ship) and surface **platform** gaps without a browser
loop. It is not a substitute product for the in-app agent.

## What transfers

- **Platform gaps transfer.** Deploy that refuses a valid schema, diagnostics
  that hide the real error, missing host capability — same underlying code
  paths the agent eventually bottoms out in. Fix once; both improve.
- **Tool-ergonomics gaps do not.** Unclear MCP descriptions, "needed three
  calls for one thing", OAuth consent friction — the in-app agent never sees
  those tools. Do not rewrite the agent from MCP UX complaints alone.

When recording a finding, label it **platform** or **ergonomics**.

## Related

- [`../architecture/OVERVIEW.md`](../architecture/OVERVIEW.md) — host / check / lint
- [`terminology.md`](terminology.md) — Thread vs session; workspace naming
- [`../notes/2026-07-29-forge-code-host.md`](../notes/2026-07-29-forge-code-host.md) — agent ships via git / forge, not snapshot publish
