#!/usr/bin/env node
/**
 * Fail if `starters/erp/app/src/routeTree.gen.ts` has drifted from
 * `tsr generate` over the current `app/src/routes/` tree.
 *
 * Template-only: hosted apps do not run the CLI; agents edit the gen file
 * with the route files. Same shape as check:seed — re-run the generator and
 * compare bytes. Regenerates via the template's `generate-routes` script
 * (tsr + banner rewrite) so the gate compares against the same output the
 * template commits, never raw tsr output.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const templateRoot = join(repoRoot, "starters/erp");
const genPath = join(templateRoot, "app/src/routeTree.gen.ts");

const before = readFileSync(genPath, "utf8");

const generated = spawnSync("pnpm", ["run", "generate-routes"], {
  cwd: templateRoot,
  encoding: "utf8",
  shell: false,
});
if (generated.status !== 0) {
  process.stderr.write(generated.stdout ?? "");
  process.stderr.write(generated.stderr ?? "");
  console.error("check:route-tree — generate-routes failed.");
  process.exit(generated.status ?? 1);
}

const after = readFileSync(genPath, "utf8");
if (before === after) {
  console.log("check:route-tree — routeTree.gen.ts matches tsr generate.");
  process.exit(0);
}

writeFileSync(genPath, before);
console.error(
  "check:route-tree — starters/erp/app/src/routeTree.gen.ts is stale."
);
console.error("\n  Fix: pnpm --filter @sfab-lite/template generate-routes");
process.exit(1);
