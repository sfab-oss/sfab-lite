# App format

**Status:** Authoritative for layout, manifest v0, generated members,
check-unit ordering, and the adapter shape. Everything named here is
built (Milestone 1, closed 2026-08-15) except a second adapter.

This file lives in `docs/architecture/` because it is the format
contract, not a working note. Implementations: schema/validation in
the format PR; closed-resolve diagnostics at check; snapshot emit and
check units in the check-plumbing PR; generated `package.json` /
`tsconfig` / `index.html` / `components.json` and image v0 in the
image PR; the starter rebuild on this tree in the starter-rebuild PR.

Decisions behind it: [ADR-0006](../decisions/0006-base-runtime-is-platform-resolved.md)–[ADR-0011](../decisions/0011-eject-rule.md);
close-out: [`../notes/2026-08-15-milestone-1-closeout.md`](../notes/2026-08-15-milestone-1-closeout.md).
Names:
[`../engineering/terminology.md`](../engineering/terminology.md).

## 1. What an app is

An app is a directory the host can seed, check, lint, pack, preview,
and serve. The format is conventions plus a declarative manifest.
There is no `lite.config.ts` and no app-level plugin API.

Code enters an app four ways, and only four: the **base runtime**
(platform-resolved; today the frozen kernel), **registry recipes**
(source copied into the tree), **catalog modules** (none yet), and
**agent-written source**. There is no `npm install` in the happy path.

Check enforces that closed import surface. A bare specifier the base
runtime does not serve fails with a named `LITE-RESOLVE` diagnostic.
Types for transitive packages may still sit in the types VFS so served
packages' `.d.ts` can resolve; they are not an app import surface.

## 2. App directory layout

TanStack-Start-shaped. Feature scope is a subdirectory under
`components/` or `lib/`, never a `src/features/` tree.

```text
<app>/
  manifest.json                 # declarative descriptor (this RFC)
  package.json                  # GENERATED — exact pins, drift-gated
  tsconfig.json                 # GENERATED — same regime
  index.html                    # GENERATED — Vite / eject shell
  safelist.txt                  # owner-editable
  components.json               # GENERATED — @lite namespace lock
  vite.config.ts                # standalone / eject; host compiles itself
  biome.json                    # injected at seed from the toolchain
  migrations/
    0001_auth.sql               # owner-editable; applied ledger is immutable
    meta/                       # snapshots; db:generate is offline (ADR-0005)
  src/
    server.ts                   # server entry (Hono)
    router.tsx                  # client router
    styles.css
    generated/
      api.d.ts                  # GENERATED — client API snapshot
      api.hash                  # GENERATED — sha256 of the server tree
    routes/                     # file-based routes
    components/<feature>/
    hooks/
    lib/<feature>/
    db/                         # schema + queries
    hono/                       # api routes: public / protected
    auth/
```

The starter in this repo uses this tree. Older `src/ui/*` /
`src/hono/index.ts` strings remain valid v0 paths; schema validation
does not require the RFC names.

### Owner-editable vs generated

| Path | Who writes it | Drift |
| --- | --- | --- |
| `manifest.json` | Owner + host (`runtime`, `recipes`) | schema-validated |
| `src/**` except `src/generated/` | Owner / agent / `add` | lint + check |
| `migrations/*.sql` | `db:generate` (offline) | CI drift vs `meta/` |
| `package.json` | Host, from the manifest + runtime pins | exact pins; owner edits are overwritten |
| `tsconfig.json` | Host | same |
| `index.html` | Host | same; eject-load-bearing |
| `components.json` | Host | `@lite` → served `/r/{name}.json` is the only registry |
| `src/generated/api.d.ts` | Check emit unit | keyed to `api.hash` |
| `src/generated/api.hash` | Check emit unit | must match the current server tree |
| `biome.json` | Seed inject | not owner-authored |

Generated files are format members, not host-private caches. A copied
tree without them is not a complete app (the eject test failed on an
empty `package.json` and a missing `index.html`).

`vite.config.ts` stays owner-visible so eject has a real Vite entry.
The hosted compile path does not run it.

### Starter-package packaging

In this repo the payload lives under `starters/erp/app/`. The
manifest's `root` field names that subdirectory for the packer. A
hosted app's tree *is* the root; seeded apps currently inherit
`root: "app"` from the starter — a packaging leak, ignored at serve,
cleaned when generated files land. `root` is not a layout instruction
for `src/`.

## 3. Manifest v0

Typed data only. No interpolation, no conditionals, no cross-field
references, no environment lookups. Flexibility lives in adapters
(framework-owned) and recipes (source in the tree).

v0 is a **superset of the packer manifest** already used by
`starters/erp/manifest.json`, `scripts/pack.mjs`, and the factory
compile path. Working field names (`server.entry`, `client.entry`,
`schema`, `source`, `inject`, `safelist`, `migrations`) stay. The
direction note's `entries` object was illustrative; renaming them
before the starter rebuild is churn. New fields wrap that core.

```jsonc
{
  "format": 0,
  "name": "erp",
  "runtime": "^0",                 // line pin; host-authoritative
  "adapter": "cloudflare",         // names a target; supplies no code
  "root": "app",                   // starter-package only (see §2)
  "server": {
    "entry": "src/server.ts",
    "exportName": "app"
  },
  "client": {
    "entry": "src/router.tsx",
    "styles": "src/styles.css"
  },
  "html": "index.html",            // eject-load-bearing; named even while
                                   //   the seed still omits the file
  "safelist": "safelist.txt",
  "migrations": "migrations",
  "schema": "src/db/schema.ts",
  "inject": {
    "biome.json": "../../framework/toolchain/app-biome.json"
  },
  "source": {
    "dirs": ["src", "migrations"],
    "extensions": [".ts", ".tsx", ".css", ".sql", ".json"],
    "files": ["safelist.txt", "package.json", "tsconfig.json", "components.json", "vite.config.ts"],
    "exclude": ["src/worker.ts"]
  },
  "capabilities": [],              // external services; empty in M1
  "modules": [],                   // catalog modules; none exist
  "recipes": {}                    // provenance, written by `add`
}
```

The starter points at `src/router.tsx` / `src/server.ts` /
`src/styles.css` / `src/db/schema.ts`. Those are data, not a schema
change; other trees remain valid v0 strings.

### Fields

| Field | Required | Who writes | Notes |
| --- | --- | --- | --- |
| `format` | yes | host | Literal `0`. Unknown versions fail closed. |
| `name` | yes | owner at create | Non-empty. Not a path. |
| `runtime` | yes | **host** | Line pin `^N` (`N` an integer). Image records the resolved exact. Today's line is `^0` (`KERNEL_VERSION` is `0.4.0`). |
| `adapter` | yes | owner at create | Allowlist; v0 is `"cloudflare"` only. |
| `root` | yes | starter packaging | Subdirectory of the starter package that is the app tree. |
| `server.entry` | yes | owner | Path relative to the app tree. |
| `server.exportName` | yes | owner | Hono export the packer compiles (`app`). |
| `client.entry` | yes | owner | |
| `client.styles` | yes | owner | |
| `html` | yes | owner / host | Path of the HTML shell. |
| `safelist` | yes | owner | |
| `migrations` | yes | owner | Directory of applied-immutable SQL. |
| `schema` | yes | owner | Drizzle schema entry (`db:generate`). |
| `inject` | yes | host at seed | Dest (app-tree path) → source (package-relative). |
| `source` | yes | host / owner | What the packer walks. |
| `capabilities` | yes | owner | `string[]`. Empty is the M1 value, not "omit the key". |
| `modules` | yes | owner | `{ name, version }[]` with **exact** versions. Empty in M1. |
| `recipes` | yes | **host (`add`)** | Map of `lite/…` → `{ version, files }`. Empty object is valid. |

Unknown keys fail at every object the schema names. Omitting a
required key fails. JSON numbers for `format` only — `"0"` is not `0`.

### Host-authoritative fields

The owner / agent must not edit these; the host overwrites them:

- `format` — the host picks the format it knows.
- `runtime` — platform-resolved line; a CVE fix is re-resolve +
  re-pack, never a per-app edit.
- `recipes` — written by `add` (version + per-file `sha256:` at copy
  time). Re-adding overwrites files; provenance records what landed.
  The PR diff is the review surface.

Generated files (§4) are host-authoritative by the same rule, and are
not manifest fields: their paths are fixed by this format.

### No interpolation

Every string in the manifest is a literal. `${…}`, `{{…}}`, and
environment lookups are schema errors. Formats that grew expression
syntax (GitHub Actions, `serverless.yml`) cracked there first. A
needed hook becomes a named field in a later format version.

### Exact records vs the runtime line pin

- **Runtime** (manifest): a line, `^N`. The image records the exact.
- **Recipe `version`, module `version`, generated `package.json`
  pins**: exact records (`1.2.3`, optional prerelease). Ranges
  (`^`, `~`, `>`, `<`, `*`, `x`, `latest`) fail the schema.
- Recipe file hashes: `sha256:` plus 64 lowercase hex chars.
- Recipe keys: `lite/` namespace, slash-separated slugs. Bare names
  fail here so they never reach a resolver that could leak to
  ui.shadcn.com.

### ADR-0005 reconciliation

[ADR-0005](../decisions/0005-app-loop-mimics-an-ordinary-repo.md): the
app workspace behaves like an ordinary repo; deviation only where the
platform cannot conform.

This format **composes with** that ADR, it does not replace it:

| Ordinary-repo shape we keep | Deviation the platform forces |
| --- | --- |
| Real `package.json` / `tsconfig.json` in the tree | Host-generated, exact pins, no install step |
| `index.html` + Vite config | Host compiles; Vite is for eject / standalone |
| Drizzle-style `migrations/` + `meta/` snapshots | `db:generate` is offline; nothing introspects a database |
| Familiar `src/routes`, `components`, `lib`, `hooks` | Closed import surface (base runtime + copied source) |
| `manifest.json` | Additional, not a substitute for the ordinary files |

The manifest is extra data the host needs (runtime line, adapter
target, provenance). It is not an executable config file and not a
replacement for `package.json`.

## 4. Generated artifacts (format members)

Fixed paths — apps do not choose them:

| Path | Role |
| --- | --- |
| `package.json` | Exact runtime pins so a copied tree `pnpm install`s. |
| `tsconfig.json` | Same regime. |
| `index.html` | Document shell. Standalone Vite and the host pack path share `formatIndexHtml`; the host injects the import map at pack. |
| `src/generated/api.d.ts` | Client API snapshot. Standalone types; no vendor leakage (`drizzle`, `hono/index`, `AppEnv`). |
| `src/generated/api.hash` | `sha256:` of the server tree the snapshot was emitted from. |

Emit, hash store, and drift gates: snapshot emit + `check:generated` for
the four root files (`package.json`, `tsconfig.json`, `index.html`,
`components.json`) are in place. One generator in `framework/toolchain`
(`generateFormatFiles`); the host regenerates on create/add and at CD
materialise. `src/generated/api.d.ts` / `api.hash` remain the check emit
unit.

### Snapshot freshness is structural (invariant 6)

The snapshot is keyed to a hash of the **server tree** (the files the
server unit sees: server entry and its import closure under `src/`,
not the client tree). A client check **must not run** against a
snapshot whose hash differs from the current server-tree hash.

Discipline ("remember to regenerate") is not the mechanism. The client
unit refuses to start on mismatch; that refusal is a check failure,
not a skip. A passing client check therefore always means: this client
was checked against a snapshot of *this* server tree.

### Client API typing is snapshot-based

The app client uses `hc<ApiType>` imported from
`src/generated/api.d.ts`. It must not write `typeof` the live server
(today: `import type { ApiType } from "../../hono"` /
`export type ApiType = typeof api`). That import fuses the graphs and
is the edge the snapshot exists to cut.

The snapshot is a type-only file. Runtime still talks HTTP to the
Hono tree; only the *types* move.

### Auth routes are excluded from the snapshot

Better-auth is mounted as a wildcard (`/auth/*` on the inner API,
HTTP `/api/auth/*`). Wildcard / `$all` routes are omitted from the
snapshot — they do not satisfy Hono's `Schema` constraint in the emit,
and the **auth client** (`better-auth/client`) types that edge.

Org-protected CRUD stays in the snapshot. Middleware that *runs* on
every route (`withAuth`) is not a route and is not a snapshot entry.

Sign-in, sign-up, session, and organization-plugin calls use the auth
client, never `hc<ApiType>`.

## 5. Check units and sync `runCheck` (invariant 7)

Two constraints that look like they fight:

1. **`runCheck` is synchronous.** Eviction of any other app's
   LanguageService happens on entry. That eviction only bounds memory
   because two requests cannot interleave inside one isolate. Making
   `runCheck` async lets two programs coexist and re-OOMs the isolate
   while the store-bound gate stays green.
2. **The check runs as units** (prod tail: cheap-union 4/50
   `exceededMemory`; server / emit / client units 0/50). Units are:
   **server** (non-accumulating typed surface, ~93 MB local),
   **emit** (snapshot write; per-module fragment ~92 MB, full-tree
   accumulating 146 MB as the cold path), **client vs snapshot**
   (React/base-ui floor, ~147–175 MB). The server unit must emit
   before any client unit consumes.

### Reconciliation

A **check run** is one worker invocation for one app. It executes
units **in order**, each as a synchronous `runUnit` (today's
`runCheck`, parameterized by roots). Between units the LanguageService
is dropped so two programs are never live.

```text
evict other apps
runUnit(server)     — sync; dispose LS
if server failed: stop (no emit, no client)
runUnit(emit)       — sync; writes api.d.ts + api.hash into the files map; dispose LS
if api.hash ≠ hash(server tree): fail (invariant 6); do not start client
runUnit(client)     — sync; roots = client entry + api.d.ts; dispose LS
return combined diagnostics
```

Rules, in writing:

- **`runUnit` stays synchronous.** The dangerous `await` is one that
  yields while a program is still referenced. Dispose happens in the
  same turn as the unit's return, before any `await` in the handler.
- **Do not accumulate routes on the server unit.** Emit is a separate
  unit. Full-tree accumulating emit is the cold path; per-edit regen
  re-emits the changed route module and prefix-merges into the stored
  snapshot (concatenation of mapped entries under a path prefix).
- **The client unit does not run** unless emit produced a hash that
  matches the current server tree. A stale snapshot is a hard fail,
  not a skipped client.
- **One LanguageService at a time**, still. Units of one run do not
  reuse each other's program (different roots). Incremental reuse
  across runs is an optimization for PR 6, not a v0 requirement; v0
  plumbing may cold-start every unit.
- **Snapshot I/O during the check is in-memory** (the files map).
  Persisting `api.d.ts` / `api.hash` onto the code host is the host's
  job after the run returns — outside `runUnit`, so it may be async.
- **`CHECK_ATTEMPTS = 2` and re-arm-before-run** (invariants 2 and 3)
  apply to the check *run*, not to each unit. A run that dies mid-unit
  is the same kill-recovery story as today.

The worker HTTP handler may `await` the host, R2, or the next request.
It must not `await` between "construct program" and "dispose program".

## 6. Adapter interface

Plugin-*shaped*, framework-owned, platform-level. An app names
`adapter` in its manifest and never implements or imports this. v0
ships the type; Cloudflare is the only target. Portability stays
unproven until a second adapter exists.

```ts
type AdapterTarget = "cloudflare";

interface ServeAdapter {
  readonly target: AdapterTarget;
  pack: (image: AppImage) => Promise<PackOutput>;
  bindings: () => {
    db: SqliteDriver;       // D1 / DO SQLite / libsql-shaped
    storage: BlobStore;
    secrets: SecretsSource;
  };
}
```

| Method | Job |
| --- | --- |
| `target` | Discriminator. v0 allowlist is `"cloudflare"`. |
| `pack` | App image → platform bundle (server module, client assets, HTML, migrations). |
| `bindings` | What a packed app resolves at serve: SQLite-shaped DB, blob store, secrets. |

HTTP entry is implied by the target (Cloudflare: a LOADER child
isolate mounting the packed server). It is not an app-level hook.

Known Cloudflare leaks a second adapter would have to attack: the
env-binding model, D1's SQLite dialect (hard-coded by ADR-0004's
trim), and Durable Object isolation. A node/libsql CI-fixture adapter
sits in the deferred backlog; it is not a v0 target.

`AppImage` (named here, built in the image PR):

```jsonc
{
  "image": 0,
  "sha": "…",
  "runtime": "0.4.0",          // resolved exact; not the manifest line
  "manifest": { /* snapshot of manifest.json at pack time */ },
  "server": "server.js",
  "client": ["client/chunk-….js"],
  "migrations": ["0001_auth.sql", "0002_erp.sql"]
}
```

The image references the base runtime; it does not contain it.

## 7. Gap map — today's surfaces → develop-plane names

Formalizing, not building. Today's factory / check / lint / LOADER
call sites keep working; later PRs retarget them onto these names.

| Develop-plane API | Today | Notes |
| --- | --- | --- |
| `app.create` | `POST /api/protected/apps`, MCP `apps_create`, `AppCreateDO` | Seed = `TEMPLATE_SEED` snapshot. Create alarm re-armed before the run (invariant 3). |
| `app.get` / `app.list` / `app.delete` | protected `/apps`, MCP `apps_get` / `apps_list` / `apps_delete` | |
| `app.check` | `POST` check worker `/check`; host `POST /apps/:id/check`; CD publish gate | Becomes the check *run* of §5. Wire types already in `framework/toolchain` (`CheckRequest` / `CheckResult`). |
| `app.lint` | `POST` lint worker `/lint`; CD before check | Sync, stateless Biome WASM. Wire types in toolchain. |
| `app.pack` | `compileAll` (server + client + css + host-built `index.html`) | Image v0: `putBuild` stores `image: 0`, resolved `runtime`, manifest snapshot, asset keys, migration names. `getBuild` fills `image: null` on legacy records so existing live apps keep serving; the next CD writes an image. No backfill. |
| `app.preview` | PR preview `/a/:appId/preview/:n`; workspace WIP `/a/:workspaceId/workspace` | Org-auth; empty+migrations SQLite, never a live clone. |
| `app.serve` | LOADER child isolate, `live_sha` → immutable build | The serve-plane half of the adapter. |
| `app.live` / `app.attempts` | `GET /apps/:id/live`, attempts; MCP `apps_live` / `apps_attempts` | Thin pointer + create-job status. |
| `app.sql` | `POST /apps/:id/sql` | App-database probe; not schema introspection (ADR-0005). |
| `app.migrate` | CD apply-by-id-and-hash | Applied migrations immutable. |
| `app.generate` | host `db:generate` — offline schema vs `migrations/meta` | Ordinary drizzle loop. |
| `app.add` | `POST /api/protected/apps/:id/add`, MCP `apps_add` | Copies `@lite` recipes into the think-workspace; provenance → `manifest.recipes`. Re-add overwrites. |
| `workspace.list` / `ls` / `read` / `write` / `rm` / `glob` | MCP `workspaces_*` / `workspace_*` | Think-workspace FS, not a console screen. |
| `workspace.bash` | MCP `bash` | |
| `forge.pr` / `forge.merge` / `forge.checks` / `forge.runs` | protected `/prs`, `/runs` | Ship via PR, not snapshot publish. |
| `code.tree` / `code.file` | forge tree routes | Code host (R2 stand-in). |

LOADER is the Cloudflare `app.serve` implementation, not a
develop-plane API of its own. Check and lint workers are the
Cloudflare `app.check` / `app.lint` implementations; their engines
extract into `framework/toolchain` gradually.

In-app agent (console thread, code-mode `execute`) is a different
surface from MCP; see
[`../engineering/agent-surfaces.md`](../engineering/agent-surfaces.md).
It is not a develop-plane verb in v0.

## 8. Schema and validation (this PR)

Types and a validator live in `framework/toolchain` (the format lives
with the toolchain; apps pin the runtime, never the toolchain). The
direction gate forbids `framework/` from importing `factory/` or
`starters/`.

`pnpm check:manifest` validates `starters/erp/manifest.json` against
v0, fails closed if a committed invalid fixture validates, and fails
when the starter drifts from the registry: committed `recipes` must
equal `assembleAll(CATALOG)` and every recipe file under
`starters/erp/app/` must hash to the catalog. Provenance is a gate,
not a claim. That red fixture is the gate lesson from
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md):
ask what the gate would still pass if the thing it protects were
broken.

Implementation trail (non-authoritative):
[`../notes/2026-08-14-app-format-rfc.md`](../notes/2026-08-14-app-format-rfc.md).

## 9. Out of scope (later PRs)

- Vendor-surface generation pipeline and the agreement gate.
- A second adapter; eject-in-CI.

## 10. Decisions this RFC settles

Left open by the plan, drafted here:

1. **Manifest field names** — packer-superset (`server` / `client` /
   `schema` / `source` / `inject`), plus `format`, `name`, `runtime`,
   `adapter`, `html`, `capabilities`, `modules`, `recipes`. Not the
   illustrative `entries` rename.
2. **Schema location** — `framework/toolchain` (`manifest.ts`,
   `validate-manifest.ts`). Gate: `scripts/check-manifest.mjs`.
3. **Adapter methods** — `target`, `pack`, `bindings` (as the
   direction note). HTTP entry stays target-implied.
4. **Runtime line for the current starter** — `^0`, not the
   illustrative `^1`, because the base runtime is still `0.4.0`.
5. **RFC path** — `docs/architecture/APP-FORMAT.md` from day one.
6. **Snapshot paths** — `src/generated/api.d.ts` + `src/generated/api.hash`.
7. **Check-run shape** — three ordered sync units, dispose between,
   in-memory snapshot I/O, host persists after return.
8. **Recipe targeting (ratified, owner 2026-08-14)** — recipes may
   copy schema source under `src/db/` and ordinary `src/` files; they
   must not target `migrations/` or `migrations/meta/`. Schema lands
   via `add`; `db:generate` writes SQL. Overwrite `add` does not
   extend to those targets — the validator still refuses them.
   Full write-up: `registry/README.md`.
9. **Generated files** — one generator in `framework/toolchain`
   (`generateFormatFiles`), `pnpm check:generated` drift-gates the
   starter, and the host regenerates on create/add (and at CD
   materialise). Agent edits of those paths are overwritten.
