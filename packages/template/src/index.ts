import manifest from "../manifest.json" with { type: "json" };

/**
 * @sfab-lite/template — the seed app.
 *
 * `app/` is the payload: the source tree a new app starts life as. It runs
 * standalone from this package (`pnpm dev`) and is also what the factory
 * seeds into an AppDataDO.
 *
 * This module exports the one thing the factory needs to know about that
 * payload — where its entry points are, and which roots are platform-owned
 * read-only.
 *
 * ## Why a manifest
 *
 * In the exploration the factory hardcoded template paths in six places,
 * including a regex over the literal string `src/ui/main.tsx` and a silent
 * `?? ""` fallback for the styles entry, so renaming a template file broke
 * the factory quietly. Here the paths are declared once; `scripts/pack.mjs`
 * and the factory both read them, and `scripts/check-workspace.mjs` fails CI
 * if a declared path stops existing.
 *
 * All paths are relative to `root`.
 */
export const TEMPLATE_MANIFEST = manifest;

export type TemplateManifest = typeof manifest;
