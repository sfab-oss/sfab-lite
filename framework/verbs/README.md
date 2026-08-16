# `@sfab-lite/verbs`

Framework commands: check, lint, build, and format overlay. Each takes a
tree (and its manifest) and returns a result. None of them knows about PRs,
`live_sha`, gates, R2, or Durable Objects — the harness composes them.

| Export | Role |
| --- | --- |
| `@sfab-lite/verbs/check` | Three-unit typecheck (`runCheck`) |
| `@sfab-lite/verbs/lint` | Biome WASM (`bootBiome`, `runLint`) |
| `@sfab-lite/verbs/build` | Server + client + CSS (`build`) |
| `@sfab-lite/verbs/format` | Overlay generated format files (`overlayFormatFiles`) |

There is no preview verb. Preview is the harness serving `build()` of a
working tree.
