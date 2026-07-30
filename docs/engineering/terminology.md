# Terminology — sfab-lite

Settled naming for docs, types, and agent surfaces. Graduated from the
manager packet glossary (2026-07-24) and aligned with the forge model
([`../notes/2026-07-29-forge-code-host.md`](../notes/2026-07-29-forge-code-host.md)).

## The two planes

| Plane | What it is |
| --- | --- |
| **Factory** | sfab-lite itself. Ordinary software; the thing we build and ship. |
| **App** | A product the factory builds and runs. *Data, not software* — per `AGENTS.md`, "apps are data; the factory is ordinary software." |

## The rule

> **Factory terms are unqualified. Anything belonging to a built app takes
> the `app` qualifier — always, even when context seems obvious.**

| Factory (unqualified) | Built app (qualified) |
| --- | --- |
| organization | **app** organization |
| user, member | **app** user |
| auth | **app** auth |
| database | **app** database |
| schema, migration | **app** schema, **app** migration |
| route | **app** route |

Signing up for the factory auto-creates *an organization*. An app's own
better-auth org plugin creates *an app organization*. Same shape, no shared
data.

## Factory terms

| Term | Meaning |
| --- | --- |
| **Template** | Seed source for a new app (`packages/template/app/`). |
| **App** | Unit the factory creates and runs. Served at `/a/:appId`. |
| **Repo** | Per-app Git repository via the **code host**. Code source of truth. |
| **Code host** | Port over Cloudflare Artifacts (R2 stand-in today). |
| **Forge** | PR + checks + merge layer (architecture name; UI may say PRs / Checks). |
| **Workspace** | Isolated agent computer for one app (AppAgent DO `ws_…`, checkout + threads + WIP). Console **Workspaces** tab lists them; WIP serve is `/a/:workspaceId/workspace`. |
| **Think workspace** / **checkout** | The mutable file tree inside a Workspace (Think / MCP FS). Not a console screen name. |
| **Build** | Immutable compile output for a commit, keyed by sha — not "artifact". |
| **Live** / **live deployment** | Thin pointer (`live_sha` on D1); serve loads that build. |
| **Preview** / **preview deployment** | Serve a PR head (`/a/:appId/preview/:prNumber`). |
| **Checks** / **runs** | Platform CI on commits / PRs. |
| **Thread** | A chat against one workspace. **The unit of work** — lite has no tasks. |
| **Session** | An *auth* session. Nothing else. |
| **Kernel** | Frozen dependency universe apps build and run against. |
| **AppDataDO** | Runtime SQLite Durable Object — not a code store. |

## Reserved words

| Word | Reserved for | Never use for |
| --- | --- | --- |
| **workspace** | Product Workspace (isolated agent computer) | Unrelated UI chrome; use **Think workspace** / **checkout** for the FS alone. |
| **session** | Auth sessions | A chat — that's a **Thread**. Think's internal "session" → **think session** if it must be named. |
| **organization** | Factory tenancy | An app's orgs — those are **app organizations**. |
| **project** | *nothing in lite* | Anything. Platform SFAB meaning; importing it here blurs both. |
| **task** | *nothing in lite* | Unit of work — use **Thread**. |
| **artifact** | Cloudflare's product noun only | Our builds — say **build**. |

Forge restored **PR / branch / merge / deploy** as ordinary product words for
the GitHub-like loop. Do not re-ban them; do not invent a parallel vocabulary
for the same ideas.

## Why Thread and not Session

Settled 2026-07-24: adopt the chat-next block's **thread** for a chat so
**session** stays free for auth. Think conversations map to threads at call
sites; the block's sandbox `session` concept does not apply (repos/branches
are forge/git, not think sandboxes).
