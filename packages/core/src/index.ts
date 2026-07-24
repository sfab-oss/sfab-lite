/**
 * @sfab-lite/core — shared contracts: app/version types, ScopedSql,
 * check/lint results, tasks-lite model.
 *
 * Filled in stage by stage. Today it holds the two pieces the template port
 * needed to have a single owner: the app-facing Biome config, and the
 * Cloudflare ambient surface (`cloudflare-ambient.d.ts`, referenced by
 * tsconfig rather than imported).
 */
export { APP_BIOME_CONFIG } from "./app-biome-config.js";
