import type { KnipConfig } from "knip";

// Dead-code detection for the sfab-lite monorepo. Same role as sfab /
// sfab-starter knip.config.ts — keep the report actionable; document
// intentional keepers with a one-line reason.
const config: KnipConfig = {
  workspaces: {
    ".": {
      entry: ["scripts/**/*.mjs!"],
      project: ["scripts/**/*.mjs"],
    },
    "apps/factory": {
      project: ["src/**/*.ts"],
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
      entry: [
        "src/index.ts",
        "scripts/prebuild.mjs!",
        "scripts/prebuild-client.mjs!",
        "scripts/prebuild-css-vfs.mjs!",
        "scripts/prebuild-types-vfs.mjs!",
        "scripts/pins.mjs!",
        "scripts/vendor-entries/*.mjs!",
      ],
      project: ["src/index.ts", "src/generated/*.d.ts", "scripts/**/*.mjs"],
      // Pins referenced only as esbuild entrySource strings / client bailouts,
      // not as static imports knip can follow from the prebuild scripts.
      ignoreDependencies: [
        "@base-ui/react",
        "@tanstack/react-query",
        "@tanstack/react-router",
        "class-variance-authority",
        "clsx",
        "tailwind-merge",
      ],
    },
    "packages/core": {
      project: ["src/**/*.ts"],
    },
  },
};

export default config;
