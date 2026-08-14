#!/usr/bin/env node
/**
 * Circular-import gate. Madge walks framework/ + starters/ + factory/.
 *
 * Exclude the AppAgent ↔ AppThread pair: the root must name its facet class
 * for subAgent/deleteSubAgent, and the facet must name its parent for
 * parentAgent — both APIs consume only `cls.name`, but TypeScript still needs
 * the class values. That cycle is intrinsic to the root/facet pattern
 * (same approach as sfab-starter's org/ madge exclude). Keeping the exclude
 * limited to these two modules prefers a compile-time static import over a
 * runtime registry that fails if registration is missed or reordered.
 *
 * Also exclude TanStack Router's generated `routeTree.gen.ts`, which type-
 * imports `getRouter` while `router.tsx` imports the route tree (Start's
 * standard generated shape).
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const exclude =
  "generated|vendor|results|\\.shims|universe|routeTree\\.gen|factory/host/src/agent/app-agent\\.ts|factory/host/src/agent/app-thread\\.ts";

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "madge",
    "--circular",
    "--extensions",
    "ts,tsx",
    "--exclude",
    exclude,
    "framework",
    "starters",
    "factory",
  ],
  { cwd: root, stdio: "inherit", shell: false }
);

process.exit(result.status ?? 1);
