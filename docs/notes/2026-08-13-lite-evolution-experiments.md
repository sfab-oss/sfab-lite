# 2026-08-13 — Milestone 1 item 8: zone memory + eject copy-out

Non-authoritative working note (see [`README.md`](README.md)). Direction:
[`2026-08-12-lite-evolution-direction.md`](2026-08-12-lite-evolution-direction.md)
item 8. Catalogue entries live in
[`../engineering/making-it-fit.md`](../engineering/making-it-fit.md).

**Status:** local stage done; production tail **not run**; decision 8's
memory candidate **not adopted**.

**Packet (local only):** `/home/ubuntu/dev/sfab-projects/active/lite-evolution/`.
No platform task (owner keeps sfab-lite off-platform).

## Ask

Before the app-format RFC hardens: (a) can per-slice checking fit the 128 MB
isolate cap, and (b) is eject copy-out real today? Local numbers never close a
memory claim; production `wrangler tail` outcome-counting is the second stage.

## How to re-run

From the monorepo root, after `pnpm install` and
`pnpm --filter @sfab-lite/kernel install-universe`:

```bash
NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @sfab-lite/check measure:zones
APPS=1 NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @sfab-lite/check measure:memory
```

`measure-zones.mjs` is the four-program harness (sibling of `measure-split.mjs`:
overlay holds every app file, only `roots` seed the program). `measure-memory.mjs`
is the worker-shaped union (`runCheck` over the seed) so the 340 MB figure is
comparable to ADR-0004 / 2026-07-27.

Eject: unpack `packages/template/generated/seed.json` `sourceFiles` into a
fresh directory (a live factory app *is* that seed), then `pnpm install && vite build`.

## (a) Memory — local comparison

Host: Node 24, `--expose-gc`, 2026-08-13, `main` @ 85514db (PR #121 merged).
Template: 72 `.ts`/`.tsx` app sources in the seed.

### Union baseline (`measure-memory.mjs`, APPS=1)

```
app source files: 72, evict=false
baseline (VFS module loaded, no program): 88.7 MB
{"app":1,"diagnosticCount":0,"rootFileCount":132,"checkMs":6261,
 "heap":"428.3 MB","delta":"339.5 MB","overBaseline":"339.5 MB"}
```

Retained over baseline **339.5 MB**. 2026-07-27 was 336.8 MB / 1351 files;
today's union in the zones harness is 1368 files / 340 MB. The template has
grown, not shrunk.

### Four programs (`measure-zones.mjs`)

Raw rows:

```
{"label":"union (today)","roots":72,"loadedFiles":1368,"loadedTextMb":5.82,"diagnostics":3,"ms":6530,"heapRetainedMb":340}
{"label":"data-only","roots":6,"loadedFiles":140,"loadedTextMb":3.1,"diagnostics":0,"ms":1290,"heapRetainedMb":77}
{"label":"shared-only","roots":4,"loadedFiles":145,"loadedTextMb":3.07,"diagnostics":0,"ms":479,"heapRetainedMb":53}
{"label":"server, client edge cut","roots":1,"loadedFiles":487,"loadedTextMb":4.55,"diagnostics":0,"ms":2995,"heapRetainedMb":215}
{"label":"generated api.d.ts","bytes":12507,"mentionsDrizzle":false,"mentionsHonoIndex":false}
{"label":"client vs generated API .d.ts","roots":1,"loadedFiles":1250,"loadedTextMb":5.47,"diagnostics":1,"ms":1437,"heapRetainedMb":145}
{"label":"summary","unionHeapMb":340,"peakSliceHeapMb":215,"isolateCapMb":128,"slicesVsUnion":0.63}
```

| program | roots | files loaded | retained heap |
| --- | --- | --- | --- |
| union (today) | 72 | 1368 | 340 MB |
| data-only (`/app/src/db/`) | 6 | 140 | **77 MB** |
| shared-only (`/app/src/contract/`) | 4 | 145 | **53 MB** |
| server, client edge cut (`hono/index.ts`) | 1 | 487 | **215 MB** |
| client vs generated API `.d.ts` | 1 | 1250 | **145 MB** |
| *peak of the four slices* | — | — | **215 MB** |

Roots: data = every file under `src/db/`; shared = every file under
`src/contract/`; server = `/app/src/hono/index.ts` only (UI files stay in the
overlay so imports would still resolve — they do not get pulled); client =
`/app/src/ui/main.tsx` after rewriting `src/ui/lib/client.ts` to
`import type { ApiType } from "./api"`.

Generated `api.d.ts` is `export type ApiType = ${typeToString(typeof api)}`
from the server program, 12.5 KB. Preview started
`HonoBase<AppEnv, …MergeSchemaPath<{ "/health": …`. No `drizzle` substring,
no `hono/index` path. One client diagnostic (unresolved `AppEnv` name in the
emit — the type is not a closed declaration). Heap **145 MB** matches the
2026-07-27 `hc<any>` stub (~144 MB): severing `hc<ApiType>` does not save the
client from React / `@base-ui/react`.

### Reading

- Data and shared sit under 128 MB *as a local indicator*. Server (215) and
  client-with-generated-dts (145) do not.
- Peak is 63% of the union. The expensive half did not shrink: 215 MB is the
  2026-07-27 server-only 213 MB re-derived.
- Splitting today's types VFS into zones is not a cap solution. Per-capability-set
  vendoring (a smaller VFS *per zone*) was not measured.
- The separate requirement that the runtime's type surface not be derived from
  the template still stands. This experiment only falsifies "split today's
  program into zones and the cap is fine."

### Production stage — not run

`wrangler whoami` on this host: **not authenticated**. Check worker has
`workers_dev: false` and is only reachable via the factory service binding.
No `CLOUDFLARE_API_TOKEN` in the environment; GitHub Actions secrets are not
readable from here.

The variant that would have to be tailed is **server, client edge cut** (the
peak). ADR-0004's local 263 MB corresponded to 0/64 production OOMs and 330 MB
to 36%, so 215 MB local is *ambiguous* against the isolate — that is exactly
why stage 2 exists. Do not adopt on stage 1.

When credentials exist: deploy a check-worker *variant* (do not overwrite
`sfab-lite-check` with experimental roots), POST the template seed as a
server-only program, `wrangler tail --format json`, count `exceededMemory`.
Record the count in this note and in `making-it-fit.md`.

## (b) Eject — copy-out is not real today

Unpacked all 81 `sourceFiles` from the committed seed into
`active/lite-evolution/artifacts/eject-copy/` (packet-local; not in git).
Top-level in the seed: `biome.json`, `components.json`, `package.json`,
`safelist.txt`, `tsconfig.json`, `vite.config.ts`, plus `src/` and
`migrations/`. **No `index.html`.**

Seeded `package.json`:

```json
{
  "name": "@sfab-lite/app",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "deploy": "wrangler deploy"
  }
}
```

No `dependencies`, no `devDependencies`. `pnpm install` is a no-op.

`vite build` (via `npx vite`, because `vite` is not a project binary) failed
loading `vite.config.ts`:

- `Cannot find package '@tailwindcss/vite'`
- unresolved `@vitejs/plugin-react`
- unresolved `vite`

Did not reach a missing-`index.html` error; that would be next. Did not try
`wrangler deploy` to a scratch account — the tree does not build.

**Consequence for the RFC:** do not claim eject. Decision 9's generated
`package.json` / `tsconfig` with real exact pins are load-bearing. Also missing
from the seed and needed for a copied Vite app: `index.html`, and the Vite /
Tailwind / React plugin pins themselves. Price any of those absent from the
format as an eject regression.

## Verdict

| Question | Answer |
| --- | --- |
| Can per-slice checking against *today's* VFS fit 128 MB? | **No** locally (peak 215 MB, server). Not a production claim. |
| Adopt decision 8's memory candidate (zones + capability-set vendoring)? | **Not adopted.** Zones-against-today's-VFS falsified locally; capability-set vendoring unmeasured; prod tail missing. |
| Runtime type surface independent of the template? | Still required. Not what this experiment measured. |
| Is eject copy-out real today? | **No.** Empty package.json, missing Vite plugins, missing `index.html`. |

## Follow-ups (do not lose)

1. Production tail of the **server zone** once Wrangler is authenticated —
   update this note and `making-it-fit.md` with the `exceededMemory` count.
2. App-format RFC must list generated pins + `index.html` as eject
   prerequisites, not later polish.
3. Restructure PR may still invert universe pins (runtime owns its pins) —
   that is the independence requirement, not the rejected memory candidate.
4. Keep writing dated notes under `docs/notes/` as further experiment
   rounds land, the same way 2026-07-25 / 2026-07-27 did. Packet files are
   not the archive.
