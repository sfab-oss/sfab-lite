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
    "factory/host": {
      // Worker/Start entry + console under `src/`.
      entry: [
        "src/server.ts",
        "src/index.ts",
        "src/router.tsx",
        "src/routes/**/*.tsx",
        "src/**/*.test.ts",
        "scripts/*.mjs",
        "vite.config.ts",
        "src/components/code/pierre-ssr-stub.ts",
      ],
      project: ["src/**/*.{ts,tsx}", "scripts/**/*.mjs", "vite.config.ts"],
      // `cloudflare:workers` is a workerd built-in, not an npm package.
      // `@tanstack/router-plugin` is applied inside `@tanstack/react-start`'s
      // Vite plugin; keep it pinned for Start alignment even if unused directly.
      // `tailwindcss` is loaded by `@tailwindcss/vite` / `@import` in styles.css.
      ignoreDependencies: [
        "cloudflare",
        "@tanstack/router-plugin",
        "tailwindcss",
      ],
    },
    "factory/ui": {
      // Primitive barrel is the library surface; shadcn CLI config is not code.
      entry: ["src/components/shadcn/index.ts"],
      project: ["src/**/*.{ts,tsx}"],
      // Pulled only via `@import` in globals.css / scanned by Tailwind.
      ignoreDependencies: ["tailwindcss", "tw-animate-css"],
    },
    "factory/check": {
      entry: [
        "src/index.ts",
        "scripts/check-drizzle-agreement.ts",
        "scripts/proof-check-units.ts",
      ],
      project: ["src/**/*.ts"],
    },
    "factory/lint": {
      project: ["src/**/*.ts"],
    },
    "factory/build": {
      project: ["src/**/*.ts"],
    },
    "framework/verbs": {
      entry: [
        "src/index.ts",
        "src/check/index.ts",
        "src/lint/index.ts",
        "src/build/index.ts",
        "src/format/index.ts",
        "src/db/index.ts",
        "src/**/*.test.ts",
      ],
      project: ["src/**/*.ts"],
    },
    // Two trees with different rules. `src` is the package the factory
    // imports; `app` is the seed payload, whose reachability roots are its
    // own entry points — anything unreachable from those would ship as dead
    // code inside every app created from the template.
    "starters/erp": {
      // The payload's own entries (`app/src/worker.ts` from wrangler.jsonc,
      // `app/src/router.tsx` from index.html) are detected; only the pack
      // script has to be declared.
      entry: ["scripts/*.mjs"],
      project: ["src/**/*.ts", "scripts/**/*.mjs", "app/src/**/*.{ts,tsx}"],
      // Loaded by @tailwindcss/vite and by `@import "tailwindcss"` in
      // styles.css, neither of which knip follows. Versions must stay
      // explicit here rather than float as transitives.
      ignoreDependencies: ["tailwindcss"],
      ignoreIssues: {
        // Emit walks this alias by name (`findApiTypeAlias`); the SPA client
        // imports `src/generated/api` instead of `typeof` the live server.
        "app/src/server.ts": ["exports", "types"],
        // Registry recipes are copied verbatim; unused exports stay so
        // provenance hashes match the catalog.
        "app/src/components/ui/table.tsx": ["exports"],
        "app/src/components/ui/alert.tsx": ["exports"],
        "app/src/components/ui/select.tsx": ["exports"],
      },
    },
    "framework/runtime": {
      // Prebuild CLI + vendor entry modules are the reachability roots.
      // Generated megabyte blobs stay out of project so knip never parses them.
      // Universe deps live in framework/runtime/universe (not this package.json).
      entry: [
        "src/index.ts",
        "scripts/prebuild.mjs!",
        "scripts/prebuild-client.mjs!",
        "scripts/prebuild-css-vfs.mjs!",
        "scripts/prebuild-types-vfs.mjs!",
        "scripts/gen-drizzle-surface.mjs!",
        "scripts/drizzle-seams.mjs!",
        "scripts/served-specifiers.mjs!",
        "scripts/ensure-universe.mjs!",
        "scripts/pins.mjs!",
        "scripts/universe.mjs!",
        "scripts/vendor-entries/*.mjs!",
      ],
      project: ["src/index.ts", "src/generated/*.d.ts", "scripts/**/*.mjs"],
      // Resolved at prebuild from framework/runtime/universe, not package.json.
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
    "framework/toolchain": {
      entry: ["src/index.ts", "src/**/*.test.ts"],
      project: ["src/**/*.ts"],
    },
    registry: {
      entry: ["src/index.ts", "src/**/*.test.ts", "scripts/*.mjs"],
      project: ["src/**/*.ts", "scripts/**/*.mjs"],
      // Invoked as `pnpm exec shadcn` with cwd=registry/ from
      // check-cli-agreement.mjs; the version pin is the agreement-gate contract.
      ignoreBinaries: ["shadcn"],
      ignoreDependencies: ["shadcn"],
    },
  },
};

export default config;
