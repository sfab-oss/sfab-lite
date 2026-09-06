# Admit a catalog pin

Scripts only. After the pin is on `main`, a hosted probe is ask-first
(`PROBE_CATALOG_LIVE=1`). Do not hand-drive MCP create/add/tail.

## 1. Placement

Confirm `pnpm check:pin-placement` would stay green:

- Not already in the kernel served maps (`CLIENT_IMPORT_MAP` /
  `SERVER_IMPORT_MAP`).
- Exactly one starter will seed the enabling recipe (or none until
  `apps_add`). ≥2 starters seeding a catalog-enabling recipe is red.
- Recipe `dependencies` is `<name>@<exact-version>` on the allowlist.

Refuse if the library needs Node-only APIs the Loader child does not
have, a canvas/DOM in the server plane, or is a multi-MB family with no
hosted probe.

## 2. Pin row

Add one object to `CATALOG_PINS` in `framework/modules/scripts/pins.mjs`:

- `name`, `version`, `loaderKey`, `esmFile`, `stubVfsPath`
  (`/node_modules/<name>/index.d.ts`)
- `boundary` (recipe helper directory, e.g. `src/pdf` — not `src/lib/`)
- `reexportDefault: true` only when the ESM is a default export
  (exceljs). Do not special-case the package name string.

## 3. Cheap surface + seams + plants

Create `framework/modules/<name>@<version>/surface.d.ts` (L2 members the
recipe actually calls) and `seams.mjs` (`export const SEAMS` with a `why`
per cheap-vs-real signature miss). Method-parameter bivariance can hide a
widened parameter; plants are the backstop.

On the on-ramp recipe (`registry/recipes/<slug>/<ver>/`):

- `registry-item.json` `dependencies: ["<name>@<version>"]`
- `plants.json` targeting **exactly one** boundary file
- `check-catalog-agreement.ts` `REQUIRED_PLANT_NEEDLES` for that recipe
  name

A plant is `{ file, find, replace, expect: "error", sides?: "cheap" | "both" }`.
Default is both sides. Use `sides: "cheap"` only when the real `.d.ts`
types the bad call as `any` (exceljs `addRow(123)`).

Wire `SEAMS` into `factory/check/scripts/check-catalog-agreement.ts`
(`SEAMS_BY_PIN`).

The helper must be mountable on org-protected Hono (`probe-catalog`
`recipeMountSpec`: import + `.route("/<slug>", …)` on
`src/hono/org-protected/index.ts`).

## 4. Isolated ESM (P3 flags)

`node framework/modules/scripts/build-module.mjs --pin=<name>@<version>`

Uses kernel-universe esbuild `0.28.1` (`ESBUILD_PIN` in `pins.mjs`).
Flags (do not invent new ones without a P3-style Loader boot):

```
--bundle --format=esm --platform=neutral --target=es2022
--conditions=workerd,worker,browser,import,module,default
--main-fields=module,browser,main
```

Isolated `npm install --ignore-scripts --save-exact`. Writes `esmFile`,
copies `surface.d.ts`, writes `manifest.json` into
`framework/modules/<name>@<version>/` only. Commit `real-vfs.json` (the
package `.d.ts` overlay for the extra check unit) beside those files.
`build-module.mjs` does not write it.

Then `node framework/modules/scripts/assemble-catalog.mjs` and
`node framework/modules/scripts/assemble-real-vfs.mjs`.

## 5. CI gates

```bash
pnpm check:modules
pnpm check:catalog-agreement
pnpm check:pin-placement
pnpm check:registry-agreement
```

`check:modules` regenerate-and-diff is the fix command
`node framework/modules/scripts/rebuild-catalog-modules.mjs`.

## 6. Loader child compat

P3: unpatched Loader ESM with `compatibilityDate: "2026-07-23"` and
`nodejs_compat`. **Gotcha:** a date ≥ 2026-08-04 rejects `nodejs_compat`
as redundant. Compat-date and the flag move together
(ADR-0016 mitigations). Do not bump one without the other.

## 7. R2

Keys (immutable per `name@version`), written by
`factory/host/scripts/upload-modules-r2.mjs`:

```
modules/<name>@<version>/<esmFile>
modules/<name>@<version>/manifest.json   ← last; presence = known
```

Missing manifest at serve is a named 409. Host Worker must not import the
ESM. `--remote` is deploy-job / owner-ask only. Idempotent unless
`--force`.

## 8. Probe

```bash
node factory/host/scripts/probe-catalog.mjs --dry-run
```

`--live` only with owner ask and `PROBE_CATALOG_LIVE=1`. Kill on
`exceededMemory` or fast-band failure (`cpuTime` < 6000 ms). Record the
dated artifact; append numbers to `making-it-fit.md` §11/§12.
