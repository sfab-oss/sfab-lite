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
      project: ["src/**/*.ts"],
    },
    "packages/template": {
      project: ["src/**/*.ts"],
    },
    "packages/kernel": {
      project: ["src/**/*.ts"],
    },
    "packages/core": {
      project: ["src/**/*.ts"],
    },
  },
};

export default config;
