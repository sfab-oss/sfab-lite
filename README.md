# sfab-lite

Edge-native **lite factory**: host + check + lint workers, a frozen kernel,
and a starter-lite template. Private monorepo under [`sfab-oss`](https://github.com/sfab-oss).

This is the productionization of the measured explore-edge-native-lite
architecture (T5 loop). Stages and layout live in the agent-workspace packet
`active/sfab-lite/` (not in this repo).

## Layout

```
apps/
  factory/   # host worker + factory UI
  check/     # TypeScript check worker
  lint/      # Biome lint worker
packages/
  template/      # starter-lite seed (independently runnable later)
  kernel/        # frozen dependency universe + prebuild
  core/          # shared contracts
  tsconfig/      # shared TS configs
  biome-config/  # shared Biome presets
```

## License

[AGPL-3.0-only](./LICENSE)

## Develop

Requires Node >= 20 and pnpm 11.

```bash
pnpm install
pnpm check:workspace
pnpm typecheck
pnpm lint:check
```

Each worker has its own `dev` script and runs standalone under
`wrangler dev` — e.g. `pnpm --filter @sfab-lite/check dev` (8802),
`pnpm --filter @sfab-lite/lint dev` (8803).

## Known limitations

Surprises worth knowing before they bite again, and the things "lite"
deliberately does not do. Add to this list when something surprises you —
that is what it is for.

### The kernel's types can promise more than its runtime delivers

The two halves of the frozen kernel come from **different sources**:

- `TYPES_VFS` is pruned from the real packages' `.d.ts`, via the
  template's TypeScript program closure against
  `packages/kernel/universe`.
- The runtime bundles come from **hand-written entry files** in
  `packages/kernel/scripts/vendor-entries/*.mjs`.

Nothing verifies that the runtime exports everything the types advertise.
When it doesn't, app code **typechecks clean, passes the publish gate, and
throws at runtime** — the one failure the check worker exists to prevent.

Found this way (2026-07-24, S2d): `vendor-entries/hono.mjs` was
`export * from "hono"`, so `hono.js` exported only `Hono` — while the VFS
shipped hono's full `validator` and `factory` types. `validator("query", …)`
typechecked clean and threw when the route was hit. Fixed by adding the
subpath exports to the entry, but **no gate prevents the next one**. A gate
comparing advertised type exports against bundle exports is the durable
fix and does not exist yet.

If you add a package to the kernel, or an app hits "X is not exported",
suspect this first.

### Apps cannot add dependencies

By design — the kernel *is* a built app's entire universe. Anything not in
it is unavailable, and adding something is a kernel change plus a rebuild
(`pnpm check:kernel` enforces the committed artifacts), never an app-level
change. This is the core "lite" trade: no per-app `npm install`, therefore
no per-app install to break.

### Version history is linear — there is no branching

Deliberate. One live version per app, single-parent `parent_id` chain, and
**revert appends a new version** rather than moving the pointer backwards.
Moving it back would create divergence, which needs a merge rule, which is
branching — a product this does not have. Versions are append-only rows in
the app's Durable Object: no per-app git repo, no per-app CI.

### A commit costs 10–25 seconds of work — but you do not wait for it

Measured on real Cloudflare deploys, against the full 32-file template:

| Operation | Work takes | check | lint |
| --- | --- | --- | --- |
| Cold app create (32 files) | 18.5–25.2s | 16.7–23.0s | 0.6–2.2s |
| Incremental commit (+1 file) | 10.6–21.3s | 10.1–24.2s | 0.14–1.9s |

Since S2.6 the HTTP request does not wait for any of that — see below.

Local numbers (~1.4s cold, ~4ms warm) do **not** predict this. The cause:
plain Workers have no isolate affinity, so the check worker's per-isolate
LanguageService cache never hits — `lsReused` was `false` on 9 of 9
production commits. Every check pays full cold construction over 1,289
VFS files.

Do not "fix" this by moving the LanguageService into a Durable Object.
That was measured and refuted: DO warmth survives ~5s of idle but not
30s, and full template checks inside a DO never stay warm at all.

Commit is therefore **asynchronous in transport, synchronous in
semantics** (S2.6). `POST /admin/apps/:appId/commit` and `POST /admin/apps`
return **202 with an `attemptId`**; poll
`GET /admin/apps/:appId/attempts/:attemptId`.

| Operation | Request returns | Work still takes |
| --- | --- | --- |
| Cold create | **0.97s** | 25.2s |
| Incremental commit | **0.16–0.25s** | 11.0–21.3s |

Nothing about the guarantee moves: **check is still the gate, no version is
minted without a pass, and a version is live the moment it exists.** Only
the waiting moved off the request.

Attempts live in `_sfab_commit_attempts` in the app's Durable Object, keyed
by an attempt id rather than a version id — a pending commit has no version
to be keyed by, which is exactly why the earlier `_sfab_check_status` table
could not do this job. Three rules make it safe:

- **At most one attempt in flight per app.** Two concurrent commits would
  check against the same parent and both mint a version, silently breaking
  linear history. The loser gets `409`.
- **Every exit writes a terminal status.** `waitUntil` has no caller to
  throw to, so a poller can only distinguish "working" from "died" if the
  work half never simply stops. `fail` = your code; `error` = we broke.
- **A stale sweep at 5 minutes** — the factory's `limits.cpu_ms` ceiling.
  `waitUntil` is best-effort, and a dropped invocation would otherwise leave
  an app permanently unable to commit.

Honest framing for anything user-facing: the *response* is instant, the
*commit* is **seconds, not minutes.** Still far better than a CI runner;
the work itself is not instant and should not be sold as such.

### `/admin/*` takes two credentials, and they are not equivalent

Since S3c every admin request needs one of:

| Credential | Scope | How it names an organization |
| --- | --- | --- |
| `X-Admin-Token` | root — every app | must pass `organizationId` explicitly |
| A signed-in session | that user's one organization | derived; naming a *different* one is `403` |

A token belongs to no organization, so it cannot have an active one — that
asymmetry is the whole reason the two paths differ. No handler branches on
which credential arrived; each consumes a resolved organization id. (Three
handlers still call the resolver themselves, because one reads the explicit
id from a JSON body and the others from the query string. Hoisting that into
the dispatcher is a follow-up.)

**A session's `activeOrganizationId` is a hint, not a grant.** Authorization
checks the `member` table on every request. better-auth does not keep that
column in sync with membership: `remove-member` clears it only when the
remover *is* the removed user, and `leave-organization` clears it only for the
current session token. Trusting the column would let a removed member keep
committing to the org's apps until their cookie expired.

Two consequences worth stating plainly:

- **No credential is `401`, whatever the config says.** Before S3c an unset
  `ADMIN_TOKEN` meant the gate returned "allowed" — a factory deployed
  without that secret had a fully open admin surface. A missing secret must
  never be the thing that grants access. Local development sets
  `ADMIN_TOKEN` in `.dev.vars` like any other secret.
- **`/a/:appId/*` is deliberately *not* covered.** That route serves a
  generated app to its own end users, who are not factory users and have no
  factory organization; scoping it by factory tenancy would be a category
  error. Its access control is the app's own better-auth, and app ids are
  unguessable ULIDs rather than names.

App-scoped admin routes (`/admin/apps/:id/…`) check registry ownership
*before* touching the Durable Object, so a cross-tenant commit or SQL call
never reaches another tenant's app at all.

### `apps/lint` is at ~91% of the Worker size ceiling

Gzipped bundle sizes, against Cloudflare's **10 MB** Paid-plan limit (Free
is 3 MB, which this project cannot fit):

| Worker | Gzipped |
| --- | --- |
| `sfab-lite-check` | 2.83 MiB |
| `sfab-lite-factory` | 4.82 MiB |
| `sfab-lite-lint` | **9.09 MiB** |

Lint is the Biome WASM binary. **A Biome version bump can make it
undeployable**, and no gate catches it — every check in this repo runs
against source, never the built bundle. `pnpm check:bundle-size` exists
for exactly this; keep it in CI.

### Timing fields reported by the workers are always `0`

`checkMs`, `wallMs`, `coldBootMs`, `totalMs` and per-file `ms` all return
`0` in production. Workers freeze the clock across purely synchronous work
as a side-channel defence, so a Worker cannot time itself. Fields measured
around a `fetch` (`checkWallMs`, `lintWallMs` in the factory) are real,
because I/O advances the clock. **Trust client-side walls.**

### Not built yet (staged, not cut)

Factory UI, auth, organizations, tasks-lite, the agent, and diffs are S3+.
See [`docs/architecture/OVERVIEW.md`](docs/architecture/OVERVIEW.md) for
what lands where.

## Docs

Engineering docs: [`docs/`](docs/) — start at [`docs/architecture/OVERVIEW.md`](docs/architecture/OVERVIEW.md).
