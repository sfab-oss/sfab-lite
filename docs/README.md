# sfab-lite docs

In-repo engineering docs (PR-authored, reviewed like code). Same posture as
`sfab` and `sfab-starter`: knowledge lives with the code under `docs/`.

**Lite** means the hosted template / frozen-kernel sub-apps — not skimpy
factory tooling or documentation.

## Map

| Path | Authority | Purpose |
| --- | --- | --- |
| [`architecture/`](architecture/) | Authoritative | Settled system shape (do not relitigate without an ADR) |
| [`decisions/`](decisions/) | Authoritative | ADRs — costly, cross-cutting choices among real alternatives |
| [`notes/`](notes/) | Non-authoritative | In-flight working notes; graduate or delete |

House rules for agents also live in [`../AGENTS.md`](../AGENTS.md). Measured
exploration evidence lives in the agent-workspace archive
`explore-edge-native-lite/` (not copied here).

## Not in this tree (yet)

- Product / operator guides and a public docs site (`apps/docs`) — deferred
  until there is a product surface to document (S3+).
- Engineering smell/structure guides — add under `docs/engineering/` when the
  codebase is thick enough to need them.
