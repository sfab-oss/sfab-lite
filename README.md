# sfab-lite

**sfab** is short for *software fabricator*. This repo is an experiment: an app
factory (typecheck, lint, publish, serve) on Cloudflare Workers with no build
container and no per-app `npm install`.

**Lite** means hosted apps run inside a **frozen kernel** (pinned deps). The
factory itself is ordinary software. Packages are `@sfab-lite/*`.

This is a personal exploration, not a product. No public deploy, no support
commitment, no stability promise.

## What the console does

Sign in, create an app, talk to it in a thread. The agent writes into a shared
per-app workspace. Apps serve at `/a/:appId`. Shipping goes through forge
(PRs, checks, merge to `main` / CD). See
[`docs/architecture/OVERVIEW.md`](docs/architecture/OVERVIEW.md).

## Layout

```
apps/
  factory/   # host worker + factory UI
  check/     # TypeScript check worker
  lint/      # Biome lint worker
packages/
  template/      # starter-lite seed (independently runnable)
  kernel/        # frozen dependency universe + prebuild
  core/          # shared contracts
  ui/            # shared console UI
  tsconfig/
  biome-config/
```

## Develop

Requires Node >= 20 and pnpm 11.

```bash
pnpm install
pnpm check:workspace
pnpm typecheck
pnpm lint:check
```

Factory console (after copying `apps/factory/.dev.vars.example` to
`.dev.vars`):

```bash
cd apps/factory && pnpm exec wrangler d1 migrations apply sfab-lite-factory --local
pnpm --filter @sfab-lite/factory dev   # http://localhost:8790
```

Local D1 starts empty. Skip the migrate step and sign-up returns 500
(`no such table: user`). Each worktree has its own `.wrangler/` state, so
every new worktree needs migrate again.

Two worktrees at once: `FACTORY_PORT=8890 pnpm --filter @sfab-lite/factory dev`.

Check and lint run as Vite `auxiliaryWorkers` with the factory. Deploy:
`pnpm --filter @sfab-lite/factory deploy`.

## Docs

| Doc | What |
| --- | --- |
| [`docs/`](docs/) | Index |
| [`docs/architecture/OVERVIEW.md`](docs/architecture/OVERVIEW.md) | Settled shape |
| [`docs/engineering/making-it-fit.md`](docs/engineering/making-it-fit.md) | Measured constraints (read before "fixing" memory/size/latency) |
| [`docs/engineering/DEPLOY.md`](docs/engineering/DEPLOY.md) | Deploy secrets and health |
| [`docs/engineering/terminology.md`](docs/engineering/terminology.md) | Naming |
| [`AGENTS.md`](AGENTS.md) | Agent house rules |

## License

[AGPL-3.0-only](./LICENSE)
