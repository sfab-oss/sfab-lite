# sfab-lite

Edge-native **lite factory**: host + check + lint workers, a frozen kernel,
and a starter-lite template. Private monorepo under [`sfab-oss`](https://github.com/sfab-oss).

This is the productionization of the measured explore-edge-native-lite
architecture (T5 loop). Stages and layout live in the agent-workspace packet
`active/lite-factory/` (not in this repo).

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

No deployables are wired in the S0 skeleton — runtime/wrangler lands later.

## Docs

Engineering docs: [`docs/`](docs/) — start at [`docs/architecture/OVERVIEW.md`](docs/architecture/OVERVIEW.md).
