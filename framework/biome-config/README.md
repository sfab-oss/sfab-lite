# `@sfab-lite/biome-config`

Shared Biome presets for the sfab-lite monorepo (same shape as
`sfab-starter`'s `@workspace/biome-config`). House linter is Biome — never ESLint.

Extend from the repo root `biome.jsonc`:

```jsonc
{
  "extends": [
    "@sfab-lite/biome-config/core",
    "@sfab-lite/biome-config/react",
    "@sfab-lite/biome-config/tanstack"
  ]
}
```
