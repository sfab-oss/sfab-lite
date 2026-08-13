# 2026-08-13 — Entities-only / one-file check

Non-authoritative (see [`README.md`](README.md)). Catalogue:
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).
Prior: [`2026-08-13-zone-check-memory.md`](2026-08-13-zone-check-memory.md).

**Status:** local done; **not adopted as a cap solution**; granularity is
still a road for server/contract edits.

**Hypothesis:** The right check unit is the agent's edit, not the app. If
we seed the TypeScript program from one feature file (imports arrive by
resolution) — or keep today's full program but run the semantic pass only
on the bumped file — retained heap sits under ~128 MB as a local indicator.

## How to re-run

From the monorepo root, after `pnpm install` and
`pnpm --filter @sfab-lite/kernel install-universe`:

```bash
NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @sfab-lite/check measure:entities
```

Harness: `apps/check/scripts/measure-entities.ts` (via `run-measure.mjs`;
same overlay-all / seed-roots shape as `measure-split.mjs`). The union
rows root every seed `.ts`/`.tsx` including `/app/vite.config.ts` — the
worker roots only `/app/src/**` — so the 3 union diagnostics are
`vite.config.ts` without vite types, not app errors. Two modes:

- **Import closure:** `programRoots = diagRoots = [the file]`.
- **Affected-file:** `programRoots = every /app file` (today's worker),
  `diagRoots = [the bumped file]` only.

## What we ran

Host: Node 24, `--expose-gc`, 2026-08-13, worktree at `5d68ad1`.
Template: 72 `.ts`/`.tsx` seed files. Files:

- `/app/src/hono/org-protected/entities.ts` — server routes; imports
  drizzle-orm, Hono, `contract/entities`, `db/schema` (barrel: auth +
  catalog + transactions), `jsonBody`.
- `/app/src/ui/routes/entities.tsx` — page; imports AppShell plus alert,
  badge, button, card, empty, input, table, skeleton, spinner, and
  `use-entities`.
- `/app/src/ui/hooks/use-entities.ts` — `hc` client + react-query.
- `/app/src/contract/entities.ts` — zod schemas only.

```
{"label":"union (today)","programRoots":72,"diagRoots":72,"loadedFiles":1368,"loadedTextMb":5.82,"diagnostics":3,"ms":6198,"heapRetainedMb":339}
{"label":"entities server, import closure","programRoots":1,"diagRoots":1,"loadedFiles":473,"loadedTextMb":4.51,"diagnostics":0,"ms":1713,"heapRetainedMb":135}
{"label":"entities client route, import closure","programRoots":1,"diagRoots":1,"loadedFiles":1347,"loadedTextMb":5.76,"diagnostics":0,"ms":3858,"heapRetainedMb":281}
{"label":"entities hook, import closure","programRoots":1,"diagRoots":1,"loadedFiles":520,"loadedTextMb":4.66,"diagnostics":0,"ms":2937,"heapRetainedMb":222}
{"label":"entities contract, import closure","programRoots":1,"diagRoots":1,"loadedFiles":142,"loadedTextMb":3.07,"diagnostics":0,"ms":459,"heapRetainedMb":52}
{"label":"union program, diagnostics only entities.ts","programRoots":72,"diagRoots":1,"loadedFiles":1368,"loadedTextMb":5.82,"diagnostics":0,"ms":2252,"heapRetainedMb":189}
{"label":"union program, diagnostics only contract/entities.ts","programRoots":72,"diagRoots":1,"loadedFiles":1368,"loadedTextMb":5.82,"diagnostics":0,"ms":1387,"heapRetainedMb":165}
```

| program | files loaded | ms | retained heap |
| --- | --- | --- | --- |
| union (today) | 1368 | 6198 | 339 MB |
| entities **server**, import closure | 473 | 1713 | **135 MB** |
| entities **client route**, import closure | 1347 | 3858 | **281 MB** |
| entities **hook**, import closure | 520 | 2937 | **222 MB** |
| entities **contract**, import closure | 142 | 459 | **52 MB** |
| union program, diagnostics only `entities.ts` | 1368 | 2252 | **189 MB** |
| union program, diagnostics only `contract/entities.ts` | 1368 | 1387 | **165 MB** |

Zone-check sibling: whole server was 215 MB; data-only 77; shared-only 53;
client-with-generated-dts 145.

## Verdict

**Not adopted as the cap solution.** Granularity **does** change the number,
but not enough on the files an agent actually edits in the UI, and the
server feature file is still **135 MB** locally (just over the 128 MB
indicator; whole-server was 215).

- Contract-only **52 MB** — fits, same ballpark as shared-only. An agent
  editing only zod schemas is cheap.
- Server `entities.ts` **135 MB** — drizzle + Hono + schema barrel. Better
  than 215 / 339, not a clear local fit.
- Hook **222 MB** — `hc` / react-query still expensive.
- Client **page** **281 MB** / 1347 files — importing AppShell + the widget
  set is almost the union. Checking "one route" does not help if that route
  imports the shell.

Affected-file (keep today's full program, semantic-pass one file): **189 MB**
for the server file, **165 MB** for the contract, **2.2 s / 1.4 s** vs 6.2 s
union. Heap follows the semantic pass (339 → 189 when we skip the other 71
roots) but the other files still sit in the program, so this is not under
the cap either. Time win is real; memory win is not enough.

## Does not imply

- That production would OOM at 135 MB — ADR-0004's 263 MB local was 0/64
  prod OOMs. A server-entities tail would be the claim, not this note.
- That stubbing vendor `.d.ts` would fail — that is the next experiment,
  pointed at this 135 MB server program.
- That a thinner widget set would fail — the 281 MB page is the reason to
  run the two-widget seed next, as its own file.
- That we should seed the program from all 72 files and only skip
  diagnostics — 189 MB is not a strategy.

## Follow-ups

- Experiment 2: stub VFS on **server entities, import closure** (135 MB).
- Experiment 3: two-widget seed, aimed at the 281 MB page.
- Do not treat "affected-file on today's full program" as the memory
  architecture; if we pursue granularity, seed from the edited file's
  import closure, not from every `/app` file.
