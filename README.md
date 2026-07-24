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

### Commit blocks on check, and the remote number is unmeasured

Commit is gated on the check passing, so the check's latency is felt
directly by the user. Measured through the service binding **locally**:
~1.4s cold, ~4ms warm. The T5 exploration measured **~12.4s remote**, and
that gap is not yet explained or re-measured on this port. If it holds
remotely, the commit-blocks-on-check choice needs revisiting.

### `worker_loaders` is unproven for deploy

The host serves sub-apps through the `LOADER` worker-loader binding.
Verified working under local `workerd`, including loading and serving a
dynamically created worker. **Not** verified for a real deploy: account
access to the binding and whether the plan permits `limits.cpu_ms: 300000`
on the check and lint workers are both still unknown.

### Not built yet (staged, not cut)

Factory UI, auth, organizations, tasks-lite, the agent, and diffs are S3+.
See [`docs/architecture/OVERVIEW.md`](docs/architecture/OVERVIEW.md) for
what lands where.

## Docs

Engineering docs: [`docs/`](docs/) — start at [`docs/architecture/OVERVIEW.md`](docs/architecture/OVERVIEW.md).
