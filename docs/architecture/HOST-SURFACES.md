# Host surfaces — framework / host-kit / factory-only

Owner decision, 2026-08-20. Classifies every develop/serve surface by
who may depend on it, ahead of any framework consumer existing. The
map is **v0-provisional**: the first real consumer of a host-kit
surface revalidates it, and revisions must name what moved and why.

## The three buckets

| Bucket | Means | Exists as code today? |
| --- | --- | --- |
| **framework** | Any consumer imports it (or conforms to it, for doc-level contracts). Lives in `framework/` / `registry/` / `starters/`, or in [APP-FORMAT](APP-FORMAT.md) as a named contract. No host assumptions. | Yes — the `framework/*` packages and APP-FORMAT |
| **host-kit** | Reusable substrate for building a develop/serve host on Cloudflare: patterns and shells a second host should get without forking `factory/`. | **Paper only.** No package exists; building one is gated on a second real host. Everything marked host-kit physically lives in `factory/` today and stays there. |
| **factory-only** | Product decisions of the `lite.sfab.dev` console. A second host writes its own. | Yes — `factory/` |

`does-not-exist-yet` marks surfaces that are named but unbuilt.

## The map

| Surface | Classification | Notes |
| --- | --- | --- |
| App format, manifest schema, `validate-manifest`, `generateFormatFiles` | **framework** (`@sfab-lite/core`) | |
| Verb engines — `check`, `lint`, `build`, format overlay | **framework** (`@sfab-lite/verbs`) | The 128 MB budget and the check-unit invariants travel with the engine ([ADR-0007](../decisions/0007-harness-depends-on-framework-never-the-reverse.md)). |
| Verb wire types (`CheckRequest`/`CheckResult`, lint/build equivalents) | **framework** (`@sfab-lite/core`) | The HTTP contract any host's shells speak. |
| Check/lint/build **Workers** (HTTP shells, `ADMIN_TOKEN` posture, one-worker-per-verb) | **host-kit** (pattern) | [ADR-0015](../decisions/0015-one-worker-per-verb.md)'s shape is host-reusable; the concrete wrangler configs, service-binding names, and deploy-as-a-set wiring are factory's. |
| Check-memory measurement/proof suite (`measure:*`, proofs) | **factory-only** (diagnostics) | Runs against the shipped ERP starter permanently — the gates measure what users get. Its findings bind framework design; the scripts don't ship. |
| Kernel package + universe install + prebuild | **framework** (`@sfab-lite/kernel`) | A consumer obtains kernel artifacts by running `install-universe` + `prebuild` in its own checkout — no artifact registry. The scripts resolve from their own package, not the repo root. |
| Kernel client chunks / catalog-module ESM in R2 (`KERNEL_R2`) | **host-kit** (serve pattern) | "Serve kernel artifacts from object storage" is the reusable idea; the bucket, upload CD step, and bindings are per-host. |
| Catalog-module artifacts (git ESM + typed stubs + hashes) | **framework** (`framework/modules`) | Stubs-at-check / ESM-at-serve is framework contract; hosting the ESM is the host's job (previous row). |
| Starters (app trees, manifests, seeds) | **framework-side data** (`starters/*`) | **Seed contract: starters export seeds as data; embedding is the host's business.** A Worker host bakes at build time (no filesystem — see `check:seed` in AGENTS.md); other host types embed their own way. |
| Registry data + lite resolver (`registry/`) | **framework-side data** | Inert ([ADR-0013](../decisions/0013-templates-and-registry-are-inert.md)). |
| Registry serving (`/r/{name}.json`) + hosted `add` (`planAdd`/apply) | **host-kit** (pattern) | "The harness decides when to add" is ADR-0013; the serving route and add-application logic are reusable shape, factory-implemented today. |
| Serve adapter: LOADER child isolates + image reads | **host-kit** | LOADER is the Cloudflare `app.serve` implementation; the adapter *shape* (generic Drizzle SQLite + storage, engine in the adapter) is framework ([ADR-0014](../decisions/0014-adapter-contract-db-storage-code-host.md)). |
| `AppDataDO`, `AppCreateDO` (deployed DO classes) | **factory-only** (deployment) | The patterns belong to the serve/create adapters above, but the live classes hold data — source-only rule; any move is a priced migration (ADR-0007). A second host instantiates its own classes from the pattern. |
| Code host (Cloudflare Artifacts) | **host-kit** (harness adapter, ADR-0014) | The framework never sees a repository; a second host brings its own code host behind the same adapter seam. |
| Workspaces (think-workspace FS, WIP serve) | **host-kit** (primitive) | [OVERVIEW](OVERVIEW.md) names Workspace/Deployment/Viewer as general primitives — that generality is the host-kit claim. |
| Develop-plane API names (`app.*`, `workspace.*`, `forge.*`, `code.*` — [APP-FORMAT §7](APP-FORMAT.md)) | **framework** (contract, doc-level) | The names are the contract a host implements; today they map onto factory routes/MCP. Versioning them belongs to the publishing stage. |
| MCP server (`/mcp`, tool implementations) | **factory-only** (implementation of the row above) | An external product consumes it as a service (MCP + Viewer URLs over HTTP). A second host implements the develop-plane names its own way. |
| AppAgent / in-console agent loop | **factory-only** | In-app agent design is separately deferred. |
| Viewer (iframe + chrome of `deployment \| workspace`) | Split: URL contract **framework** (doc-level); component **host-kit candidate** | The workspace/preview/live URL shapes any host must serve are contract. The React component stays in `factory/`; it graduates to host-kit only if a consumer demands the chrome itself rather than the URLs. |
| Board | **does-not-exist-yet** | Deferred product. A consumer may build its own board on Viewer URLs — it is not owed by the framework. |
| CD, PR checks, `live_sha` pointer flow | Split: image v0 + `live_sha` semantics **framework** (APP-FORMAT); the CD composition **factory-only** | [ADR-0012](../decisions/0012-framework-owns-the-verbs.md): the host is a composer; each host composes the verbs into its own CD. |

## What this implies

- Nothing in `factory/` moves. Host-kit is a label for "reusable
  shape, factory-implemented" until a second host exists.
- A publishing stage publishes only **framework** rows.
- Consuming the framework from another checkout today (git/workspace
  path) is proven and documented in
  [`../engineering/consuming-framework.md`](../engineering/consuming-framework.md).
  `pnpm check:verb-independence` is the CI contract (red-tested).

## Related

- [OVERVIEW](OVERVIEW.md) — runtime shape, primitives
- [APP-FORMAT](APP-FORMAT.md) — the app contract, adapter, develop-plane names
- [ADR-0007](../decisions/0007-harness-depends-on-framework-never-the-reverse.md) — direction rule, source-only transforms
