# ADR-0005: The app loop mimics an ordinary repo, and stops introspecting the database

**Status:** Accepted
**Date:** 2026-07-27
**Deciders:** Alwurts

## Context

An agent session was asked to build a delivery feature into a seeded app. It
read 27 files without re-reading one, followed the resource chain, and produced
a schema, an API, a typed client, two pages, a router entry and a sidebar link
that typechecked and linted clean on the first try. Then `pnpm db:generate`
failed with `not authorized: SQLITE_AUTH`, and so did `pnpm run deploy`. The
feature was never published.

Both commands fail in the same place. `db:generate`
(`agent/shell-commands.ts`) and the deploy gate (`commit.ts`) each call
`stub.bootstrap(...)` to apply the migration files and then
`stub.introspectSchema()` to read back what they produced, and
`introspectSchema` PRAGMA-walks every row `sqlite_master` returns. The
reserved-prefix filter that would exclude the Durable Object's own tables runs
downstream in `diffSchema`, not before the walk. Under miniflare there is no
authorizer and the walk succeeds; in production there is one. The comment in
`schema-ddl.ts` recording the `__miniflare_` case already anticipated this
asymmetry in the other direction.

That is the immediate defect. The reason it existed at all is the decision
worth recording.

`drizzle-kit` cannot run here — it depends on esbuild and, through its CLI,
better-sqlite3, and `drizzle-kit/api` is a 2.9 MB bundle importing `fs`,
`child_process` and `worker_threads`. This was established during the original
exploration (`archive/explore-edge-native-lite/RESEARCH.md`) and re-confirmed
against the installed package. So the diff, the DDL emitter and the migrator
are ours to write. `PLAN.md` from that exploration set the constraint we still
hold to: *"The authoring agent keeps them in sync" is not the mechanism — the
diff is.*

What was built to satisfy that was a diff against the **live database**. The
alternative — a diff against a **stored snapshot** — is what drizzle-kit
itself does, and it needs no database at all.

The deciding argument is not elegance. A coding agent's priors come from a very
large number of ordinary repositories. In the session above, the agent
hand-wrote `0003_water_delivery.sql` in direct violation of an explicit
instruction not to, because when `generate` fails in a normal project, writing
the SQL yourself is what you do. Every deviation from the standard loop is a
place where instinct fights the prompt, and instinct is cheaper than the
prompt. That session also spent 162,604 characters of reasoning against 7,818
characters of output, and the model's thinking is a binary flag with no budget
knob — so architecture is the only lever left.

## Decision

**The app workspace behaves like an ordinary repository running an ordinary
drizzle + CI/CD loop. Deviation is permitted only where the platform cannot
conform — the frozen import map, the absent filesystem, the absent install
step. Nothing introspects a database at any stage.**

The loop:

1. Edit `src/db/schema.ts`.
2. `pnpm db:generate <name>` — offline. Diffs the last
   `migrations/meta/000N_snapshot.json` against the schema, writes the SQL and
   the next snapshot. Opens no database.
3. **CI** — typecheck, lint, drift check (that same diff must come back empty).
4. **CD** — apply pending migrations by id and hash, then publish.

Two supporting rules:

- **Applied migrations are immutable.** The ledger records one row per applied
  migration with its hash, and a changed or missing file is refused. This is
  what git history and code review provide in a normal project, and neither
  exists inside an app workspace.
- **The drift gate lives in CI, not in deploy.** Drift detection in CI is a
  thing teams already do; a special deploy-time refusal is not.

## Consequences

### Positive

- `SQLITE_AUTH` becomes unreachable rather than fixed — the code path is gone.
- `db:generate` becomes a pure function of workspace files, so it is testable
  at full fidelity under `node --test`. The introspection path was reachable
  only through hand-written PRAGMA fixtures, which is how this shipped.
- Editing an applied migration stops being invisible.
- `system-prompt.ts` loses most of the section explaining that editing the
  schema does not change the database — not because the constraint went away,
  but because the agent already knows it.

### Negative

- Nothing verifies that a generated migration's SQL actually implements the
  snapshot it was generated from. If they disagree, the failure surfaces at
  query time rather than at deploy.
- The snapshot files are new artifacts in the user's codebase.

### Mitigations

- The SQL is derived from the schema rather than authored, and the ledger makes
  it immutable once applied, so the two can only diverge through a defect in
  the emitter — which is unit-testable and shared by every app.
- drizzle accepts precisely this trade, and its `meta/` directory is a shape
  users already recognise.

## Implementation notes

Phased, one PR each; each phase leaves the system no worse than it found it.

0. Prompt fixes — no `node_modules` on disk plus the icon names, a failure
   branch on the `db:generate` rule, and decide-once-then-write.
1. Checksum ledger replacing the count in `app-migrations.ts`.
2. Snapshots; `db:generate` goes offline. Restores `db:generate`.
3. Deploy becomes a staged pipeline: typecheck → lint → drift → migrate →
   publish. Restores deploy.
4. Delete `introspectSchema`, the PRAGMA walk and `RESERVED_TABLE_PREFIXES`;
   move the agent-facing surface to commit / deployed-ref / pipeline-run
   vocabulary; expose rollback; cut the prompt.

`diffSchema` is untouched throughout: `introspectSchema` and `probeSchema`
already return the same `SchemaSnapshot`, which is what makes phase 2 small.

Out of scope, deliberately: a git remote, real repository storage, branches and
PRs per app. `_sfab_versions` is already append-only with a `parent_id`, and
`_sfab_live` is already a pointer — the object model is a commit log, and what
is missing is a remote rather than a design. Splitting commit from deploy waits
for a branch or a reviewer to exist.

## Related

- [ADR-0001](0001-edge-native-lite-architecture.md) — apps are data; the
  factory is ordinary software
- The pre-build exploration's `RESEARCH.md` and `PLAN.md` (manager workspace,
  `explore-edge-native-lite`) — drizzle-kit's dependencies, why it stays out of
  the loop, and the drift-guardrail constraint quoted above
