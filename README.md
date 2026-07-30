# sfab-lite

**sfab** is short for *software fabricator*. This repo is an experiment: an app
factory on Cloudflare Workers (host, check, lint) with a frozen kernel for
hosted apps, no build container, and no per-app `npm install`.

**Lite** means those hosted apps run inside the kernel. The factory itself is
ordinary software. Packages are `@sfab-lite/*`.

Personal exploration, not a product: no public deploy, no support commitment,
no stability promise. Shape and constraints live under
[`docs/`](docs/) (start at
[`docs/architecture/OVERVIEW.md`](docs/architecture/OVERVIEW.md)). Agent rules:
[`AGENTS.md`](AGENTS.md).

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

## License

[AGPL-3.0-only](./LICENSE)
