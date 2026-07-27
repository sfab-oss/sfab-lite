import type { KnipConfig } from "knip";

// Dead-code detection for the sfab-lite monorepo. Same role as sfab /
// sfab-starter knip.config.ts — keep the report actionable; document
// intentional keepers with a one-line reason.
const config: KnipConfig = {
  workspaces: {
    ".": {
      // check-cycles.mjs is the madge gate; see its header for the AppAgent ↔
      // AppThread exclude rationale (intrinsic root/facet class-name cycle).
      entry: ["scripts/**/*.mjs!"],
      project: ["scripts/**/*.mjs"],
      // check-bundle-size.mjs runs `pnpm exec wrangler` with cwd set to each
      // app, so it resolves from that app's node_modules where wrangler is a
      // real dependency. Declaring it at the root would be the wrong fix.
      ignoreBinaries: ["wrangler"],
    },
    "apps/factory": {
      // Worker entry + Vite console UI. UI sources stay in `project` so unused
      // exports inside `ui/src` still surface; React deps are reached from
      // `ui/index.html` → `ui/src/main.tsx`.
      // `ui/src/components/ui/index.ts` is the ported primitive public API —
      // entry so knip treats its re-exports as the library surface, not dead.
      entry: [
        "src/index.ts",
        "src/**/*.test.ts",
        "scripts/*.mjs",
        "ui/index.html",
        "ui/src/components/ui/index.ts",
      ],
      project: [
        "src/**/*.ts",
        "scripts/**/*.mjs",
        "ui/src/**/*.{ts,tsx}",
        "ui/vite.config.ts",
      ],
      // `cloudflare:workers` is a workerd built-in, not an npm package.
      // `tw-animate-css` is pulled only via `@import` in styles.css.
      ignoreDependencies: ["cloudflare", "tw-animate-css"],
    },
    "apps/check": {
      project: ["src/**/*.ts"],
    },
    "apps/lint": {
      project: ["src/**/*.{ts,tsx}"],
    },
    // Two trees with different rules. `src` is the package the factory
    // imports; `app` is the seed payload, whose reachability roots are its
    // own entry points — anything unreachable from those would ship as dead
    // code inside every app created from the template.
    "packages/template": {
      // The payload's own entries (`app/src/worker.ts` from wrangler.jsonc,
      // `app/src/ui/main.tsx` from index.html) are detected; only the pack
      // script has to be declared.
      entry: ["scripts/*.mjs"],
      project: ["src/**/*.ts", "scripts/**/*.mjs", "app/src/**/*.{ts,tsx}"],
      // Loaded by @tailwindcss/vite and by `@import "tailwindcss"` in
      // styles.css, neither of which knip follows. The version is also a
      // kernel pin, so it must stay explicit here rather than float as a
      // transitive dep.
      ignoreDependencies: ["tailwindcss"],
    },
    "packages/kernel": {
      // Prebuild CLI + vendor entry modules are the reachability roots.
      // Generated megabyte blobs stay out of project so knip never parses them.
      // Universe deps live in packages/kernel/universe (not this package.json).
      entry: [
        "src/index.ts",
        "scripts/prebuild.mjs!",
        "scripts/prebuild-client.mjs!",
        "scripts/prebuild-css-vfs.mjs!",
        "scripts/prebuild-types-vfs.mjs!",
        "scripts/ensure-universe.mjs!",
        "scripts/pins.mjs!",
        "scripts/universe.mjs!",
        "scripts/vendor-entries/*.mjs!",
      ],
      project: ["src/index.ts", "src/generated/*.d.ts", "scripts/**/*.mjs"],
      // Resolved at prebuild from packages/kernel/universe, not package.json.
      ignoreDependencies: [
        "esbuild",
        "react",
        "react-dom",
        "tailwindcss",
        "better-auth",
        "drizzle-orm",
        "hono",
        "zod",
      ],
    },
    "packages/core": {
      project: ["src/**/*.ts"],
    },
  },
};

export default config;
