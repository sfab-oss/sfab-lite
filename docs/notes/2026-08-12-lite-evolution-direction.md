# 2026-08-12 — Direction: from experiment to lite framework (draft)

Non-authoritative working note (see [`README.md`](README.md)). This is the
draft directional plan for sfab-lite's next phase. Pieces graduate by move
into `docs/architecture/` and ADRs as milestones land; until then the
existing [`OVERVIEW.md`](../architecture/OVERVIEW.md) remains authoritative
for what is built.

## Premise, answered — and the next question

The original experiment question — *can a whole factory (typecheck, lint,
build, serve) run on Workers with no build container?* — is answered yes,
with the costs catalogued in
[`making-it-fit.md`](../engineering/making-it-fit.md). The next question:

> Can this substrate become an **agent-first lite framework** — a closed
> ecosystem where agents build reliable full-stack apps without npm — with
> the factory as its reference develop host?

This repo transforms in place to find out. Extraction of the framework
into its own repo (and any renaming) waits until the contracts below stop
thrashing; boundaries get drawn first, here.

## The direction

Two planes, explicitly separated:

| Plane | Purpose | Portability |
| --- | --- | --- |
| **Develop** | Source, check, lint, pack, agent, preview — on Workers isolates | Reference host is this repo; interface-shaped, not vendor-abstract |
| **Serve** | Run packed app images for end users | Portable via thin platform adapters (Cloudflare first; others later) |

Code enters an app four ways, and only four:

1. **Base runtime** — framework-owned, versioned, platform-resolved (the
   frozen kernel, formalized — see decision 2).
2. **Registry** — recipes copied as source into the app tree (`add
   <recipe>`), editable, no opaque package graph. The primary extension
   mechanism (decision 6).
3. **Catalog modules** — rare, pre-measured heavy dependencies. None yet;
   deliberately deferred.
4. **Agent-written code** — the default for everything else.

There is no `npm install` in the happy path, by design: predictable
surface for agents, enforceable isolate budgets, deterministic packs.
Eject stays real — an app tree plus an adapter is enough to leave the
host; heavy eject transforms are a non-goal.

The first product consumer is a **small-business ERP starter**. It is a
forcing function for the framework, not the subject of this note; the
framework stays product-agnostic.

## Vocabulary

| Term | Meaning |
| --- | --- |
| **Base runtime** | The versioned, platform-resolved dependency universe apps resolve against (`framework/runtime/`). Successor term for "kernel"; rename is gradual, docs first. |
| **Toolchain** | The machinery that develops apps: app format, check/lint/pack engines, serve adapters (`framework/toolchain/`). Apps pin the runtime; they never reference the toolchain. |
| **App format** | Conventions + declarative manifest that make an app tree something the host can seed, check, pack, preview, serve. |
| **Manifest** | Typed, data-only app descriptor: entries, runtime version, declared modules, adapter target, recipe provenance. Never executable. |
| **App image** | Content-addressed pack output: app source build + manifest + base-runtime *reference*. |
| **Recipe** | A registry unit — a shadcn registry item (source files + metadata) copied into the app tree. |
| **Adapter** | Per-platform serve plug-in: HTTP entry, DB driver, storage, secrets, pack target. Framework-owned; apps only name a target. |
| **Harness** | The testing/reference surface around the framework in this repo: factory console UI, chat/agent API, workspaces. Depends on the framework, never the reverse. |

## What exists vs what this formalizes

The repo is further along than a greenfield reading suggests. Milestone 1
is mostly formalization and restructuring, not construction:

| Direction concept | Today | Gap |
| --- | --- | --- |
| Closed resolve | Enforced (frozen kernel, import-map gate) | Diagnostics are not agent-grade |
| App image | Immutable builds keyed by sha + `live_sha` pointer | No manifest, no recorded runtime version, format unnamed |
| Develop-plane APIs | Factory routes + check/lint workers + workspaces | Not named as a contract; no gap map |
| App format | Implicit in the template | No written layout + manifest schema |
| Repo boundaries | Monorepo grown by experiment | Framework / host / registry / starters / shell not yet distinct |
| Runtime type surface | Derived from the template's program (VFS closure + pins read from its package.json) | Independence from any one app — decision 8, measured in item 8 |
| Registry | — | Everything |
| In-app agent | Factory-side workspace agent only | No per-app agent primitive (design first) |
| Serve adapters / eject | — | Interface shape defined in M1; implementations deferred |

## The plan in shapes

Everything in this section is **illustrative** — exact names and fields are
settled by the restructure PR and the app format RFC (milestone items 1–2).
The shapes are what matter.

### Repo after the restructure

Designed greenfield, not as a least-cost rename. The organizing
principle: **the top level is the future repo map** — each directory is
something that could become its own repository by lifting it out, and
the monorepo era is explicitly temporary convenience.

```text
sfab-lite/
  framework/                # → future repo: the lite framework itself
    runtime/                #   what apps RESOLVE AGAINST — the universe
                            #   (its OWN pins), types VFS, kernel chunks,
                            #   import maps. "runtime": "^1" points here.
    toolchain/              #   what DEVELOPS apps — app-format/manifest
                            #   schema, check/lint/pack engines, serve
                            #   adapters; later eject/validate
  registry/                 # → future repo: recipes — versioned content
                            #   on its own cadence, immutable retention;
                            #   a consumer of framework, not a part of it
  starters/
    erp/                    # → future repo(s): starter templates — pure
                            #   consumers of framework + registry
  factory/                  # → future repo: the hosted product — host
                            #   worker, thin check/lint worker shells,
                            #   console UI (harness)
  docs/
```

The dependency gate becomes one readable rule: `framework/` imports
nothing outside itself; `registry/` and `starters/` import only
`framework/`; `factory/` may import everything. The runtime/toolchain
split inside `framework/` is the compiler-vs-stdlib cut: a TypeScript
bump is visibly a toolchain change, a new React is visibly a runtime
line, and the manifest's most important field names a real directory's
artifact.

Mapping from today: `apps/factory` → `factory/` (host + console; its
check/lint callers become thin shells over `framework/toolchain`
engines — extracted gradually, under decision 3's invariant inventory);
`packages/kernel` → `framework/runtime` (with its own universe pins —
decision 8); `packages/template` → `starters/erp`; `packages/core`
dissolves into `framework/toolchain`; `packages/ui` → `factory/`
(harness). `framework/` is deliberately brand-neutral — the `lite` name
is a placeholder, and placeholders don't belong in import paths.

### A lite app tree (app format)

TanStack-Start-shaped for agent familiarity — not the current template's
`src/ui/*` nesting. (sfab-starter's registry content does **not**
transfer: its targets use `src/features/`, rejected here, and its items
are Radix-shaped where lite's UI vocabulary is base-ui. Lite recipes
carry their own targets.)

```text
mi-tienda/
  manifest.json           # NEW — the declarative descriptor (below)
  package.json            # GENERATED by the host from the manifest at
                          #   pack — real exact pins, drift-gated,
                          #   read-mostly. Keeps eject true and keeps the
                          #   agent's ordinary-repo priors (ADR-0005).
  tsconfig.json           # GENERATED — same regime
  index.html
  migrations/
    0001_auth.sql
    0002_erp.sql
  src/
    server.ts             # server entry (Hono)
    router.tsx
    routes/               # file-based routes (TanStack style)
    components/           # components; feature-scoped in subdirs —
                          #   src/components/parties/party-form.tsx
    hooks/
    lib/                  # utilities; feature-scoped in subdirs —
                          #   src/lib/parties/party-schema.ts
    db/                   # schema + queries (drizzle-style, SQLite-shaped)
    hono/                 # api routes: public/ protected/ org-protected/
    auth/
    styles.css
```

### Manifest v0 (declarative only — decision 4)

```jsonc
{
  "format": 0,
  "name": "mi-tienda",
  "runtime": "^1",                  // pins a runtime LINE (decision 2);
                                    //   the image records the resolved
                                    //   exact. Host-authoritative — the
                                    //   agent does not edit this field.
  "adapter": "cloudflare",          // names a target; supplies no code
  "entries": {
    "server": "src/server.ts",
    "client": "src/router.tsx",
    "html": "index.html",
    "styles": "src/styles.css",
    "schema": "src/db/schema.ts"    // drives migrate/generate
  },
  "source": { "dirs": ["src"], "exclude": ["**/*.test.ts"] },
  "safelist": "safelist.txt",
  "migrations": "migrations",
  "inject": { "biome.json": "app-biome" },  // what check:app-lint protects
  "capabilities": [],               // external services (invoicing,
                                    //   messaging, …) — empty in M1; the
                                    //   slot exists so future needs land
                                    //   here, not in ad-hoc hooks
  "modules": [],                    // catalog modules — none exist yet
  "recipes": {                      // provenance, written by `add`:
    "lite/party-form": {            //   version + per-file content hash
      "version": "0.1.0",           //   at copy time, so a future
      "files": {                    //   diff-assist can distinguish
        "src/components/parties/party-form.tsx": "sha256:…"
      }                             //   "unmodified" from "edited"
    }
  }
}
```

Data only, and inert: no interpolation, no conditionals, no cross-field
references, no environment lookups — ever. (Every declarative format
that cracked — GitHub Actions, serverless.yml — cracked at expression
syntax first, not plugins.) There is no `lite.config.ts`.

This is a **superset of the manifest the packer already uses**
(`packages/template/manifest.json`) — the format inherits its working
fields (styles, safelist, schema, source, inject) rather than shrinking
them and rediscovering each under pressure.

### A registry recipe item (decision 6)

A shadcn registry item, validated against a **vendored, pinned revision**
of the schema (shadcn shipped three unilateral schema releases in ten
months; we adopt upstream changes on our schedule), with lite's profile
in `meta`:

```jsonc
{
  "name": "lite/party-form",                // lite namespace — bare names
                                            //   are a resolver ERROR, they
                                            //   never reach ui.shadcn.com
  "type": "registry:block",                 // unknown types rejected by CI
  "title": "Party form",
  "description": "Create/edit form for a party (customer or supplier).
    Use when the app manages parties. Assumes src/db exports a parties
    table.",
  "registryDependencies": ["lite/form-field"],
  // NOTE: no "dependencies" key. It must be ABSENT (not merely empty) —
  // registry CI rejects the item otherwise. npm cannot enter here.
  "meta": {
    "liteProfile": 1,                       // positive profile marker
    "liteRuntime": ">=1.0.0"                // base runtime requirement
  },
  "files": [
    {
      "path": "registry/blocks/party-form/party-form.tsx",
      "type": "registry:component",
      "target": "src/components/parties/party-form.tsx"
    }
  ]
}
```

The `description` is written for agents — when to use it and what it
assumes — because the agent choosing correctly between `add` and writing
code is the mechanism the whole registry bet rests on.

### Adapter interface shape (defined in M1, one implementation)

```ts
interface ServeAdapter {
  readonly target: string;                      // "cloudflare" | later others
  pack(image: AppImage): Promise<PackOutput>;   // image → platform bundle
  bindings(): {                                 // what a packed app resolves at serve
    db: SqliteDriver;                           // D1 / DO SQLite / libsql-shaped
    storage: BlobStore;
    secrets: SecretsSource;
  };
}
```

Framework-owned and plugin-shaped; an app never implements or imports
this — it names a `target` in its manifest. Honest scope: this is a
*shape*, and portability stays unproven until a second adapter exists —
the known Cloudflare leaks a second adapter would attack are the
env-binding model, D1's SQLite dialect (hard-coded by the ADR-0004
trim), and DO isolation. The cheap de-risk (a boring node/libsql
adapter as a CI fixture, not a supported platform) sits in the deferred
backlog.

### App image v0 (naming what exists)

Builds are already immutable and sha-keyed with a `live_sha` pointer;
v0 adds the manifest snapshot and runtime record inside:

```jsonc
// image.json within build <sha>
{
  "image": 0,
  "sha": "3f9c…",
  "runtime": "1.0.4",              // the resolved EXACT version — the
                                    //   manifest pins a line ("^1"), the
                                    //   image records what was used. A
                                    //   runtime CVE fix = new resolve +
                                    //   re-pack, no per-app manifest edit.
  "manifest": { /* snapshot of manifest.json at pack time */ },
  "server": "server.js",
  "client": ["client/chunk-a1b2.js"],
  "migrations": ["0001_auth.sql", "0002_erp.sql"]
}
```

The image references the runtime; it does not contain it (decision 2).
Serving from an image = adapter + runtime version + these bytes.

### A closed-resolve failure (item 3's target quality)

```text
LITE-RESOLVE error in src/lib/report.ts:2
  Cannot import "date-fns" — not part of the app surface.
  An app resolves: the base runtime (1.x: hono, drizzle-orm, react,
  zod, …), registry-copied source under src/, and its own files.
  Fix: write the helper yourself, or check `registry search date`.
  npm packages cannot be added to a lite app.
```

The message names what *is* available and both sanctioned alternatives —
today's equivalent failure is a bare resolution error.

## Decisions

1. **Product-pull ordering.** One vertical slice — parties plus a
   customer credit ledger, from a *generic* ERP starter — forces the
   framework work; format, registry, and diagnostics formalize
   just-in-time as the slice demands them. Framework-first sequencing was
   considered and rejected: registry quality is product quality, and
   recipe quality cannot be judged without a product slice pulling on it.
   The slice is a vehicle; its domain depth is deliberately out of scope
   here. To be precise about how this composes with foundational work:
   the milestone list below is **not a priority queue** — foundational
   items settle *contracts* (format, resolver, boundaries) while the
   slice pulls their *content* (which fields, which recipes, which
   diagnostics). Both proceed together; neither waits for the other.

2. **Base runtime is platform-resolved, not vendored.** The manifest pins
   a runtime version; images carry a runtime *reference*, not runtime
   bytes; each supported version is a types-VFS + client-chunk set the
   host carries. Vendoring the runtime into app trees was rejected: it
   multiplies per-app checked surface against the 128 MB budget and turns
   every runtime fix into a per-app source migration. Consequence stated
   plainly: cross-platform portability means *same app code*, not *same
   bytes* — eject tooling bundles the runtime at copy-out time.

   Version policy (settling the former open question): the manifest pins
   a **line** (`^1`); the image records the resolved **exact** — so a
   runtime security fix is a re-resolve + re-pack, never a per-app
   manifest edit. The support window splits by plane: **serve** carries
   old versions indefinitely (an old image keeps serving — the
   Cloudflare compat-date policy), **develop** carries a small N (each
   version is a types-VFS + client-chunk set against real memory and
   upload limits; N comes from measurement, not policy), with
   fall-forward — an app pinned below the window checks against the
   oldest carried version with a warning, never a hard fail. Capability
   *removal* is a new runtime line with its own migration story, never a
   patch.

3. **Transform this repo in place — greenfield-minded.** A curated copy
   into a new repo was rejected as losing provenance while contracts are
   still moving. But the asset being preserved is the **measured
   knowledge** — [`making-it-fit.md`](../engineering/making-it-fit.md),
   the gates, the refuted ideas — not the code. Existing framework-side
   code is inspiration: delete or rewrite it freely where it does not
   serve this direction. Everything here is one of two things:
   **framework-side** (runtime, toolchain, registry, starters — what
   the future-repo map marks extractable) or **harness** — the testing
   and reference surface around it (factory console UI, chat/agent API,
   workspaces).
   Harness code may stay as-is for testing; the standing invariant is
   the dependency direction: **harness depends on framework, never the
   reverse.** Two qualifications keep this stance safe:

   - The direction rule needs a gate that can actually see direction:
     `check:cycles` (madge) finds *cycles*, not one-way violations, so
     the restructure adds a dependency-allowlist gate. And the M1 split
     is **source-only** — moving Durable Object classes to a separate
     worker is a live-data migration, priced separately if ever.
   - **Invariant inventory.** Five measured behaviors are enforced only
     by code shape, and any rewrite must carry them: (1) `runCheck` is
     synchronous — async lets two programs coexist and re-OOMs the
     isolate while every gate stays green; (2) `CHECK_ATTEMPTS = 2` is a
     wall-clock budget — four attempts measurably made creates worse;
     (3) the create alarm is re-armed *before* the run, which is the
     entire kill-recovery mechanism; (4) the `@base-ui/react`
     whole-package exception is load-bearing (ADR-0004); (5) the drizzle
     trim's two build-time assertions stay. Red-test the gates that
     protect these before trusting a rewrite. Two more join the
     inventory with decision 8's architecture: (6) **snapshot
     freshness is structural, not disciplined** — the `api.d.ts` is
     keyed to a hash of the server tree, and a client check can never
     run against a snapshot from a different hash; (7) if the check
     runs as units, unit ordering — server
     pass emits before any client pass consumes — must be reconciled
     with the sync-`runCheck` invariant *in the RFC, in writing*.

4. **Apps are configured by a declarative manifest — there is no
   app-level plugin system.** No executable config file, no build/serve
   hook API. A plugin API would be an arbitrary-code extension point in
   exactly the place the closed ecosystem exists to protect, and could
   never be removed once agents depend on it. Flexibility lives in the
   two sanctioned places: adapters (plugin-*shaped* interface, but
   framework-owned and platform-level) and recipes (source in the tree,
   where agents may edit anything). If a real hook need emerges, a
   narrow named hook can be added to the manifest — cheap in that
   direction, impossible in reverse. External-service needs (invoicing,
   messaging, payments) have a declared home already: the manifest's
   `capabilities` array — so product pressure lands in a versioned slot,
   not in accreted hooks.

   This composes with, rather than relitigates,
   [ADR-0005](../decisions/0005-app-loop-mimics-an-ordinary-repo.md)
   ("the app loop mimics an ordinary repo; deviation only where the
   platform cannot conform"): where the platform *can* conform we keep
   the ordinary shape — the app tree carries a real (host-generated,
   drift-gated) `package.json` and `tsconfig.json`, drizzle-style
   migrations, familiar layout — and the deviations are confined to what
   the platform genuinely forces: the closed import surface and the
   absent install step. The manifest is additional, not a replacement
   for the ordinary files.

5. **In-app agent: design before build.** A dedicated per-app Durable
   Object (durable conversation history, tools over the app's own data)
   is the stack's most novel missing primitive — but structure comes
   first. Milestone 1 produces its design (DO shape, tool transport,
   memory posture); the build lands in a later milestone.

6. **Registry: reuse the shadcn *data format*; serve it in the standard
   form; lock the namespace.** Do not invent a recipe format — use the
   shadcn registry-item schema, which sfab-starter already ships. Treat
   shadcn as an upstream adopted on our schedule, not a live dependency:
   the schema revision is **vendored and pinned** (shadcn shipped three
   unilateral schema releases in ten months, drifting *toward* carrying
   npm and config), items carry a positive `meta.liteProfile` marker,
   and registry CI **fails closed** — unknown item types rejected, and
   the npm `dependencies` key must be *absent*, not merely empty.

   **Owner revision 2026-08-14 (supersedes the collision-refusal choice
   in the original decision):** lean into shadcn compatibility. The
   factory serves built items at `/r/{name}.json` (canonical address:
   `https://lite.sfab.dev/r/{name}.json` — survives extracting
   `registry/` into its own repo). `components.json` is host-generated
   and configures `@lite` as the **only** registry, so
   `npx shadcn add @lite/button` works for local/ejected apps and
   foreign registries are unreachable by construction (this replaces
   any wrapper CLI). Bare names remain a hard error on hosted `add`
   (they still resolve to ui.shadcn.com in stock CLI). `add` overwrites
   target files — nothing is silent; every add ships through the PR
   loop and the PR diff is the review surface. No modified-since-add
   warnings. Provenance (`manifest.recipes` version + per-file hash at
   copy time) stays; it records what came from where, it no longer
   blocks. A CI agreement gate runs the real pinned `shadcn` CLI
   against the served registry and asserts file placement matches
   `planAdd`. GitHub source-registry form (`owner/repo/item#ref`) is a
   possible later bonus, not the canonical address. Recipe versions
   are retained immutably forever — a registry living only at monorepo
   HEAD loses the original bytes. No auto-update, ever.

7. **The memory gate is an absolute per-app ceiling, measured in
   production — not a per-recipe budget.** Every recipe copied into an
   app permanently grows that app's *checked* surface, but a per-recipe
   heap number is the wrong gate: heap follows the semantic pass, not
   the file graph; recipe costs don't add (shared closure vs disjoint
   generic-heavy surface); and a per-recipe budget passes for eight
   recipes in an app that OOMs — exactly the "correct check certifying
   a broken product" pattern
   [`making-it-fit.md`](../engineering/making-it-fit.md) warns about,
   and the absolute ceiling it already asks for. So: a fixture app
   carrying the maximum sanctioned recipe set, checked against the real
   deployed worker (`wrangler tail`, counting outcomes — never local
   workerd), gating with honest headroom under 128 MB. It lands
   together with the first recipes. Per-recipe measurements may still
   be *recorded* as informational signals; they gate nothing.

8. **The runtime's type surface must be defined independently of any
   one app's program.** Today it is not: the types VFS is closure-pruned
   against `packages/template/app/src`
   (`prebuild-types-vfs.mjs`), and the kernel's version pins are read
   from the template's own `package.json` (`pins.mjs`). The framework
   is *derived from the starter* — the inverse of every boundary in
   this plan, and invisible to an import-graph gate because the edge is
   a build script reading files. Closure pruning works because there is
   exactly one app shape; the registry's entire purpose is N app
   shapes, and every recipe that reaches surface the template's program
   never touched either fails the check on legitimate framework API or
   forces another whole-package exception — the `@base-ui/react`
   exception (22 loaded files when written, 373 now, prime suspect in
   the open 336.8 MB regression) is what one instance already cost.
   The candidate answer is per-capability-set vendoring with slices/
   zones as units of separate checking; it is adopted **only if
   measurement supports it** — milestone item 8 runs the falsification
   experiments first, in this repo's tradition.

   **Item 8, local result (2026-08-13) — candidate not adopted.** Full
   write-up:
   [`2026-08-13-zone-check-memory.md`](2026-08-13-zone-check-memory.md)
   (eject: [`2026-08-13-eject-copy-out.md`](2026-08-13-eject-copy-out.md)).
   Four programs over today's template (`measure-zones.ts`): data-only 77 MB,
   shared-only 53 MB, server-with-client-edge-cut 215 MB, client vs
   generated API `.d.ts` 145 MB. Peak 215 MB against a 340 MB union.
   Splitting today's VFS into zones does not fit the cap; the server
   half is the already-rejected 213 MB split re-derived. Generated
   `.d.ts` severs `hc<ApiType>` (no drizzle in the emit) and does not
   save the client from React / base-ui. Production verification of the
   server zone was not run (no Wrangler login). Per-capability-set
   vendoring remains unmeasured. The independence requirement above
   still stands; only the memory candidate is rejected for now.

   **Rounds 2–4, local result (2026-08-13) — replacement architecture
   adopted locally.** The zone candidate stayed dead; what the follow-up
   experiments converged on instead
   ([stack](2026-08-13-stack-typed-shallow.md) ·
   [typed stubs](2026-08-13-typed-cheap-stubs.md) ·
   [snapshot emit](2026-08-13-snapshot-accumulating-hono.md) ·
   [fragments](2026-08-13-snapshot-route-fragments.md)) is:

   - **Generated, accurate, cheap vendor type surfaces**, owned by the
     runtime — the independence mechanism and the heap fix are the same
     artifact. Typed drizzle+Hono checks the server entry at **93 MB**
     (real VFS: 222) with zero false diagnostics, and catches planted
     errors that `any` misses. The measured overlays were handwritten
     proofs; the product is a generation pipeline gated by an
     **agreement gate** (cheap surface and real types must produce
     identical verdicts over template + recipes, planted errors caught
     by both).
   - **The client edge is a snapshot, not live inference.** The
     server's `ApiType` is evaluated once and emitted as a standalone
     `api.d.ts` (~6 KB, no vendor leakage); the client keeps
     `hc<ApiType>` inference — routes, inputs, response types — against
     that file. Freshness proven: a server return-shape change
     regenerates the snapshot and breaks stale client call sites.
     Regeneration stays cheap by re-emitting only the **changed route
     module** and prefix-merging (**92 MB**; full-tree emit is 146 and
     is only a cold-rebuild path). Route accumulation stays *off* the
     ordinary server check. Wildcard auth routes are excluded from the
     snapshot; the auth client types that edge.
   - **The whole-app union is not the unit that fits.** Stacked best
     case is 255 MB local. The check runs as units: server (93),
     snapshot emit (92/module), client vs snapshot (147–175 — the
     React/base-ui floor).

   **Production tail matrix (2026-08-13) — fork closed.** Throwaway
   worker `sfab-lite-check-exp`, 50 invocations each
   ([write-up](2026-08-13-prod-tail-matrix.md)). The 255 MB cheap-surface
   union was **4/50 `exceededMemory`** — a single-program architecture is
   not viable. Units confirmed. Server unit 0/50, full-server emit 0/50,
   client-vs-snapshot 0/50. Control union (340 local) 0/50: the old
   330-local → ~1-in-4 mapping does not hold on this worker; the tail
   was measuring (same session caught the four cheap-union kills). The
   dedicated real-types snapshot worker (215 MB program) stays
   fallback-only.

9. **The eject rule.** Eject = copy the app tree + pick an adapter, and
   that stays true by construction: the base runtime may expose only
   (a) the API of a real, pinned npm package, or (b) framework source
   small enough to copy into an ejected app verbatim. No capability may
   have an API that exists solely inside our host. The generated
   `package.json`/`tsconfig.json` in every app tree carry the real
   pins, so a copied tree builds with ordinary tools. Stated honestly:
   the lock-in risk that remains concentrates in base-runtime
   *services* (auth, DB shape, routing) — that is what the rule and the
   (deferred) eject-CI job exist to bound, and the import list was
   never the real risk.

## Milestone 1 — establish the structure

Suggested attack order (dependency logic, not decree): **items 8 and 1
open the milestone** — the experiments because their numbers steer
decisions 2 and 8 before the RFC hardens, the restructure because every
later PR lands inside the new layout. Then item 2 (the RFC). Items 3, 4
and 5 proceed together — the slice pulls on the registry and the
diagnostics as it grows. Items 6 and 7 close the milestone.

1. **Repo restructure** — land the future-repo-map layout
   (`framework/{runtime,toolchain}`, `registry/`, `starters/erp`,
   `factory/`) and make its one-rule dependency gate enforceable with a
   **dependency-allowlist gate** (`check:cycles` finds cycles, not
   direction). Engine extraction out of the check/lint workers is
   gradual, under decision 3's invariant inventory — thin shells first
   where cheap, not a big-bang. **Source-only**: no Durable Object
   class moves across workers in this milestone. Existing harness
   surface may stay as-is; framework-side code may be freely deleted or
   rewritten along the way (decision 3). This is the first PR series,
   not the last. *Done when:* the allowlist gate runs in CI and fails a
   synthetic `framework/` → `factory/` import.
2. **App format RFC** — directory layout + manifest v0 (declarative-only
   per decision 4), the adapter interface shape (defined now, even while
   Cloudflare is the only implementation), and a gap map of existing
   factory / check / lint / LOADER surfaces onto named develop-plane
   APIs. Three requirements inherited from the experiments: the
   `api.d.ts` **snapshot is a first-class generated artifact** of the
   format (host-authoritative, hash-keyed to the server tree, listed
   alongside the generated `package.json`/`tsconfig` — and `index.html`,
   which the eject test proved missing); the client's API typing is
   **snapshot-based** (`hc<ApiType>` from the generated file, never
   `typeof` the live server); and the **auth routes are excluded** from
   the snapshot — the auth client types that edge, stated in the RFC,
   not discovered. *Done when:* the RFC is merged and a template-shaped
   app validates against manifest v0's schema.
3. **Closed resolve at check — correctness first, then diagnostics.**
   This is not a copywriting task: today, types for transitive
   dependencies the runtime does not serve (kysely, jose, better-call…)
   ride in the VFS, so importing them **passes typecheck** and fails
   only later — the shipped agent prompt admits it. Check must enforce
   the import map (prune transitive types or gate the resolver). Then
   the failure gets the agent-grade message: what was tried, what
   exists, and what to do instead (registry or write it). *Done when:*
   importing a transitive-only module (e.g. `kysely`) fails check with
   the named diagnostic — red-tested by deliberately breaking it, per
   making-it-fit's gate lesson.
4. **Registry MVP** — the `registry/` package with the pinned vendored
   schema, lite's own resolver (`lite/` catalog keys, `@lite/` CLI
   addresses, bare names error), the fail-closed CI gates
   (`dependencies` absent, unknown types rejected), the hosted `add`
   verb with per-file hash provenance (overwrite, not collision
   refusal — owner 2026-08-14), immutable version retention, the
   served `/r/{name}.json` registry, and a handful of excellent
   recipes pulled from the slice's real needs. *Done when:* the
   starter's shared components install via `add` with provenance
   recorded; a bare `registryDependencies` name hard-fails; an item
   carrying a `dependencies` key is rejected by registry CI; `npx
   shadcn add @lite/button` against the served registry matches
   `planAdd` (agreement gate).
5. **Starter slice** — rebuild the template as a generic ERP starter on
   the new app tree (`src/routes/`, `src/components/<feature>/`,
   `src/lib/<feature>/` — not `src/ui/*`): parties + credit ledger,
   **assembled from the registry via `add`** — the registry is the
   single canonical source of every shared component; the starter is a
   composition, not a parallel copy drifting under different gates.
   Rewrite over refactor where simpler (decision 3). Functional bound
   (it is a vehicle, not the product): party list + party detail,
   charge and payment entry, running balance per party, a list of open
   balances — nothing else. No aging buckets, no statements, no
   documents, no inventory. *Done when:* a fresh app seeded from the
   starter passes lint + check and serves, with every shared component
   provenance-recorded.
6. **App image v0** — name what exists: manifest inside the build,
   resolved exact runtime version and recipe provenance recorded,
   hash-addressed; host serves only from images. *Done when:* every
   serving path reads an image and every new image carries the exact
   runtime + provenance record.
7. **In-app agent design doc** — per decision 5. *Done when:* the doc
   answers tenancy, state location, agent↔app tool transport, and
   memory posture, each with its making-it-fit citation.
8. **The two experiments, before the RFC hardens.**

   (a) *Memory — can per-slice checking fit the cap?* Two stages,
   because local memory numbers are never final claims
   ([`making-it-fit.md`](../engineering/making-it-fit.md)):
   1. **Local comparison** with the existing
      `apps/check/scripts/measure-memory.mjs`: retained heap for four
      programs over today's template — data-only; shared-only; server
      with the client edge cut; and client checking against a
      *generated* API `.d.ts`, which severs the `hc<AppType>` import
      that fused the graphs in the refuted naive split (170/213 MB).
      This stage picks the winner and sizes the effect.
   2. **Production verification** of the winning variant only: deploy
      it as a check-worker variant, run real checks against it, and
      count `exceededMemory` in `wrangler tail --format json` —
      outcome-counting against a real deploy, exactly how ADR-0004's
      numbers were earned. No architecture is adopted on stage 1
      alone.

   (b) *Eject — is copy-out real today?* Local, no prod: copy a live
   app's tree out of the platform, `pnpm install && vite build` (and
   `wrangler deploy` to a scratch account if it builds). If it works,
   the manifest-era format must ship its generated
   `package.json`/`tsconfig` in the same change or be priced as an
   eject regression; if it fails, record what was actually missing
   before the RFC claims anything.

   *Done when:* both results are recorded in `making-it-fit.md` and
   decision 8's candidate is adopted or rejected in writing.
   **2026-08-13:** local numbers and eject failure recorded in
   [`2026-08-13-zone-check-memory.md`](2026-08-13-zone-check-memory.md)
   and [`2026-08-13-eject-copy-out.md`](2026-08-13-eject-copy-out.md);
   candidate **not adopted**. Follow-up rounds (see the
   [experiments index](2026-08-13-lite-evolution-experiments.md))
   replaced it with the architecture now recorded in decision 8;
   local stage is **complete**. Stage 2, the **five-program prod tail
   matrix**, ran 2026-08-13
   ([`2026-08-13-prod-tail-matrix.md`](2026-08-13-prod-tail-matrix.md)):
   cheap-union **4/50** OOM → units; server / emit / client units 0/50.
   Decision 8's fork is closed.

### Suggested rollout — about ten PRs

Consolidated deliberately: few enough that each PR is a meaningful unit,
not so few that any becomes unreviewable. Each lands gate-green.
(Was "about eight"; the experiment rounds added two implementation
units the original list did not name.)

1. **Experiments** — the item-8 results into `making-it-fit.md`, plus
   the written adopt/reject of decision 8's candidate. **Done** (PRs
   #122–#125 + the prod tail matrix). Cheap-union 4/50 OOM closed the
   fork on units. Does not gate PR 2.
2. **Restructure** — the mechanical `git mv` to the future-repo map,
   workspace/CI paths, the runtime's own universe pins (the inversion
   fix), and the direction gate with its red test. Large but low-risk;
   review is "did behavior change?" (it must not). **Done** (PR #130).
3. **App format** — the RFC plus the manifest schema and validation of
   a starter-shaped app. **Done** (PR #131).
4. **Closed resolve** — transitive types pruned or resolver-gated in
   check, the agent-grade diagnostic, the `kysely` red test. **Done**
   (PR #132).
5. **Types pack** — the generation pipeline for the runtime-owned
   vendor surfaces (decision 8): generator, the agreement gate
   (cheap-vs-real verdict parity over template + recipes), planted-
   error red tests. Replaces the handwritten experiment overlays.
   Design input: the seam table in
   [`2026-08-14-generator-spike.md`](2026-08-14-generator-spike.md).
   **Done** (PR #133).
6. **Check plumbing** — the snapshot artifact (emit, hash-keyed store,
   per-module regen + prefix merge) and **check units** wired into the
   worker loop (prod tail closed the single-program fork: cheap-union
   4/50 OOM). Consumes PRs 3 and 5. **Done** (PR #134). Re-tail vs the
   0/8 baseline: **0/8 OOM, 0 retries, 8/8 ready**; wall per check
   ~+60% ([`2026-08-14-units-retail.md`](2026-08-14-units-retail.md)).
7. **Registry** — the package, pinned vendored schema, CI gates,
   resolver, hosted `add` with provenance. **Done** (PR #136). Owner
   revision 2026-08-14 (this PR): overwrite `add`, served
   `/r/{name}.json`, `@lite` namespace lock, CLI agreement gate.
8. **Starter** — the rebuild on the new tree, assembled from the
   registry, recipes extracted as they emerge (splits into two PRs if
   the diff gets large: skeleton, then the slice). **Done** (PR #138,
   one PR): RFC §2 tree, parties + credit ledger within the bound,
   seven recipes assembled with provenance, `check:manifest` fails on
   drift from the catalog. Checkpoint 4 (owner product feel + owner-
   gated re-tail) follows the merge
   ([`2026-08-14-pr8-starter-rebuild-check.md`](2026-08-14-pr8-starter-rebuild-check.md)).
9. **Image + generated files** — image v0 on every serve path, plus
   the generated `package.json`/`tsconfig`/`api.d.ts` (and
   `index.html`) with their drift gate.
10. **Agent design doc** — doc-only.

### Milestone 1 exit criteria

An agent can: create an app in the new format, `add` a recipe and see
its provenance recorded, hit closed resolve with an actionable failure,
and ship an image the host serves. The two experiments are answered
with numbers in `making-it-fit.md`. The repo's top level is the
future-repo map with the direction gate green. Anything less and the
milestone is not done; anything more is the next milestone arriving
early.

## Non-goals for this phase

An app-level plugin/config system (decided against, not merely deferred —
decision 4) · a lite CLI wrapper (stock `npx shadcn add @lite/…` is
the ejected path; hosted verbs stay on the factory) · serve adapters beyond Cloudflare and any
second-adapter proof · an owned pack engine (existing bundling stays
underneath) · catalog modules · the in-app agent *build*, write-actions,
and confirmation UX · repo extraction or renaming · the wider ERP domain
beyond the slice · Postgres.

**Deferred backlog** (right ideas, wrong milestone — nothing here is
foreclosed): the eject-in-CI job (eject the starter, `pnpm i && build &&
test` on Node — binds when the runtime API starts growing) · VFS-out-of-
bundle via R2 (only if measurement says develop must carry more than ~2
runtime versions) · a node/libsql CI-fixture adapter (when the image
format stabilizes) · a fast pre-lint structural validate gate ·
per-file `pinned`/`seeded`/`owned` recipe modes (the provenance hashes
already preserve this option) · the **component-layer snapshot lever**
(sever base-ui from page checks the same way `api.d.ts` severs the
server — binds only if the prod tail says the 147–175 MB client unit
is tight) · the **better-auth typed surface** (~36 MB more off the
server unit; implementation-adjacent, not research).

**Named only** (acknowledged, no design yet): a catalog-module admission
process — it must exist *before* the first external-service need
arrives, not after · a fleet-upgrade operation (plan/dry-run/promote/
rollback) · an unmanaged-fraction metric (how much of an app no
mechanism can upgrade) · derived-manifest machinery (the hand-authored,
schema-validated manifest comes first) · **facade packages** — runtime
APIs designed to be cheap-to-check *by construction* (real published
packages, so the eject rule holds) instead of cheap surfaces mimicking
vendor APIs; the long-game version of decision 8.

**Named but not built: the source-upgrade problem.** The seed is a
snapshot and registry copies are too — fixes reach *new* apps only
([`OVERVIEW.md`](../architecture/OVERVIEW.md)). Acceptable for an
experiment; the single biggest unsolved problem for long-lived apps on a
framework whose extension mechanism is copied source. The provenance
record from decision 6 is the hook a future migration mechanism stands
on; the mechanism itself is deferred — deliberately, and in writing.

## Standing constraints (unchanged)

- **128 MB per isolate** governs everything; the check-worker regression
  (336.8 MB retained) is open and prior; nothing in this plan may make it
  worse unmeasured.
- **Memory claims are verified in production**, never under local
  workerd.
- **Measured-and-rejected ideas stay rejected**
  ([`making-it-fit.md`](../engineering/making-it-fit.md)) — this
  direction does not reopen them.
- **The TS 7 lever is tracked, not built — and measured smaller than
  advertised.** On this tree `tsgo` was **1.14× leaner in RSS** (not
  the cited ~2.9×, a different metric and program —
  [`2026-08-13-tsgo-forecast.md`](2026-08-13-tsgo-forecast.md)) and
  ~2.5–4.7× faster. Excluded by the TS 6.0.3 pin. A versioned base
  runtime still makes the bump schedulable (a future runtime line =
  TS 7 closure); re-measure LanguageService-shaped heap the day the
  pin can move, and do not budget the isolate on 2.9×.
- **Existing experiment apps are a declared reset.** M1 changes the app
  shape, and the seed-is-snapshot rule means existing apps never follow;
  rather than carry a two-shape compatibility rule forever, apps created
  before the app format land are disposable. Stated here so it is a
  decision, not an accident.

## Open questions

- Manifest field names and exact app tree (settled by the RFC, item 2).
- Package naming under the new layout (`@lite/*` is placeholder-bound;
  settled with branding, not by item 1).
- Source-of-truth store: R2 code host today; Git-compatible DO-backed
  storage is the expected successor — keep the interface adapter-shaped.
- Develop-plane N: how many runtime versions check/pack can carry —
  bounded by the measured bundle limits (the types VFS is a 9.87 MB
  bundle constant in a worker near the 10 MB gzip cap); decided by item
  8's measurements, and by the VFS-out-of-bundle backlog item if N must
  exceed ~2. (The window *policy* itself is settled in decision 2.)
- Agent↔app tool transport (in-process vs RPC) — decided in the agent
  design doc (item 7).
- Naming (`lite`, `add`, verb set) — placeholder until the CLI ships.
- Cost per app. The premise of the whole experiment is "cheaper than
  containers," and no document states a target. Once the M1 develop
  loop is exercised, measure a real figure (create + N check cycles +
  serve, in dollars) and set the target that gates scale-out.

## Graduation plan

When milestone 1 lands: the app format RFC becomes
`docs/architecture/APP-FORMAT.md`; decisions 2, 3, 4, 6, 8 and 9 become
ADRs if their reversal cost proves real; this note is deleted (deletion
is success). Decision 8 is the furthest along: the experiment notes
back it, the prod tail closed its fork on units, and it is ADR-ready.
