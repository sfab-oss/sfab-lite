# 2026-08-14 — Generated cheap drizzle surface

Non-authoritative (see [`README.md`](README.md)). Catalogue:
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).
Prior: [`2026-08-13-typed-cheap-stubs.md`](2026-08-13-typed-cheap-stubs.md)
(handwritten target shape).

**Status:** local done; **works-with-seams**.
**Hypothesis:** A script can generate the cheap drizzle surface from (a)
the real `drizzle-orm` `.d.ts` in the kernel universe and (b) the
template's usage sites, such that the agreement gate passes: template
server files 0 diags = 0 diags against the real VFS, planted
`eq(entity.id, 0)` / `name: 123` caught by both, heap ~ the handwritten
~100 MB on the server-entities closure.

## How to re-run

From the monorepo root, after `pnpm install` and
`pnpm --filter @sfab-lite/kernel install-universe`:

The product gate is `pnpm check:drizzle-agreement` (runtime seam table
+ committed types-pack). Numbers below are the spike at `bc24d20`; the
spike harness was deleted after the live VFS overlay made a `null`
overlay cheap-vs-cheap.

```bash
pnpm check:drizzle-agreement
```

## What we ran

Host: `oracle-cool-big-child-1`, Node 24, `--expose-gc`, 2026-08-14,
worktree at `bc24d20` plus this spike. Universe `drizzle-orm@0.45.2`.

14 used names, all present in the universe, all covered by seams:

`and`, `asc`, `count`, `desc`, `drizzle`, `eq`, `index`, `integer`,
`notExists`, `relations`, `sql`, `sqliteTable`, `text`, `uniqueIndex`.

Real universe types (why copy-from-`.d.ts` fails): `eq` is
`BinaryOperator`; `sqliteTable` is `SQLiteTableFn`; `text` /
`integer` return `SQLiteTextBuilderInitial` / `SQLiteIntegerBuilderInitial`;
`drizzle` from `d1` is `DrizzleD1Database` extending
`BaseSQLiteDatabase`. Those graphs are the dialect cost ADR-0004 already
paid.

```
{"label":"entities, real VFS","diagnostics":0,"heapRetainedMb":141}
{"label":"entities, handwritten typed","diagnostics":0,"heapRetainedMb":101}
{"label":"entities, generated","diagnostics":0,"heapRetainedMb":100}
{"label":"broken entities, real VFS","diagnostics":2,"plantCaught":true}
{"label":"broken entities, generated","diagnostics":2,"plantCaught":true}
{"label":"drizzle-using server files, handwritten","diagnostics":13,"heapRetainedMb":156}
{"label":"drizzle-using server files, real VFS","diagnostics":0,"heapRetainedMb":191}
{"label":"drizzle-using server files, generated","diagnostics":0,"heapRetainedMb":156}
{"label":"agreement","healthy0eq0":true,"serverAgree":true,"plantCaughtBoth":true,"heapGeneratedMb":100,"heapHandwrittenMb":101,"heapDeltaMb":1,"pass":true,"result":"works-with-seams"}
```

Planted errors (entities.ts): real VFS TS2769 overloads; generated
TS2345 / TS2322 number vs string. Both catch.

The handwritten overlay from the typed-stubs experiment is **not** 0
diags on all drizzle-using server files (13 errors: `text` enum arity,
`returning(shape)`, `onConflictDoNothing`, `sql` in `.set`, relational
`query` row type). The generator started from that shape and grew seams
until the broader gate passed.

## Seams (the deliverable)

Hand-curated. The script does **not** print real signatures into the
overlay — it only uses the universe to assert the name exists, then
emits the cheap form.

| Seam | Why the real `.d.ts` cannot be copied |
| --- | --- |
| `Column` / `Query` / `Database` / `RowOf` / `InsertValues` | Real types are dialect builder graphs (`SQLiteTableFn`, `BinaryOperator`, `BaseSQLiteDatabase`) |
| `primaryKey()` → `Column<Exclude<T, null>>` | Real sqlite primary key is not-null; the cheap `text().primaryKey()` would otherwise stay `string \| null` |
| `InsertValues` allows `V \| SQL` | `.set({ totalCents: sql\`…\` })` in documents |
| `returning(shape?)` | `delete().returning({ id: user.id })` in seed |
| `onConflictDoNothing()` | products insert |
| `eq<T>(column, T \| null)` | `eq(organization.id, activeOrganizationId)` where the right side is `string \| null` |
| `text(name, opts?)` | `text("kind", { enum: […] })` — handwritten missed this (only checked entities.ts) |
| `integer` `timestamp_ms` / `boolean` overloads | schema timestamps and `emailVerified` |
| `db.query.*.findFirst` → `Promise<any>` | relational query API; a typed `Record<string, unknown>` made `row.id` unusable |
| `count(expression?)` | real signature takes an optional wrapper |

Copying the real export line for any of those names re-opens the
column-builder / dialect load. That finding is the gate for PR 5: a
types pack is **usage-driven emit + a seam table**, not a subset of
upstream `.d.ts` files.

## Verdict

**works-with-seams.** Inventory is generated from the template +
universe. Cheap types for the sqlite/D1 DSL are curated. Agreement
passes (entities 0=0, all drizzle-using server files 0=0, plants
caught, heap 100 vs handwritten 101). Do not ship this overlay as the
check worker's VFS — it is the proof that PR 5 can generate, and a
list of the seams that design has to own.

## Does not imply

- Production fit at 100 MB — still a local indicator. The throwaway
  server unit (93 local) was 0/50; this program was not tailed.
- That Hono / better-auth surfaces generate the same way.
- That `query: Promise<any>` is the long-term relational API — it is
  the seam that unblocked session-context, and PR 5 should decide
  whether to type it.

## Follow-ups

- PR 5 types pack: keep the usage scan + universe existence check;
  store the seam table next to the pack, fail the build when the
  template imports a name with no seam.
- Same spike for Hono (non-accumulating) before treating that surface
  as generated.
