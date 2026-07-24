import config from "../app-biome.json" with { type: "json" };

/**
 * The Biome configuration the factory lints and formats app sources with.
 *
 * It lives as a real Biome config file (`../app-biome.json`) rather than as a
 * literal here for one reason: it can then be *run*. `pnpm check:app-lint`
 * checks `packages/template/app/src` against that exact file, so the
 * invariant that matters — a freshly seeded app reports zero diagnostics on
 * code its owner has not touched — is enforced by CI rather than asserted in
 * a comment. (It is not named `biome.json`, or Biome would discover it as a
 * second root config and refuse to run at all.)
 *
 * It cannot simply extend `@sfab-lite/biome-config`: the lint worker runs
 * Biome's WASM build and hands it this object through `applyConfiguration`,
 * where `extends` has no package resolution. So it is a standalone config
 * that happens to agree with the repo's on everything the payload touches —
 * and `check:app-lint` is what proves the "happens to" part.
 *
 * `$schema` and `root` are stripped: they are file-level concerns that
 * `applyConfiguration` rejects.
 */
const { $schema: _schema, root: _root, ...rest } = config;

export const APP_BIOME_CONFIG = rest;
