#!/usr/bin/env node
/**
 * Fail if any starter's `app/src/routeTree.gen.ts` has drifted from
 * `tsr generate` over the current `app/src/routes/` tree.
 *
 * Mutates then restores — one starter at a time.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const startersRoot = join(repoRoot, "starters");

const starterIds = readdirSync(startersRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

let failed = false;

for (const id of starterIds) {
  const templateRoot = join(startersRoot, id);
  const genPath = join(templateRoot, "app/src/routeTree.gen.ts");
  const pkg = JSON.parse(
    readFileSync(join(templateRoot, "package.json"), "utf8")
  );
  const before = readFileSync(genPath, "utf8");

  const generated = spawnSync("pnpm", ["run", "generate-routes"], {
    cwd: templateRoot,
    encoding: "utf8",
    shell: false,
  });
  if (generated.status !== 0) {
    process.stderr.write(generated.stdout ?? "");
    process.stderr.write(generated.stderr ?? "");
    console.error(`check:route-tree — starters/${id} generate-routes failed.`);
    failed = true;
    continue;
  }

  const after = readFileSync(genPath, "utf8");
  if (before === after) {
    console.log(
      `check:route-tree — starters/${id}/app/src/routeTree.gen.ts matches.`
    );
    continue;
  }

  writeFileSync(genPath, before);
  console.error(
    `check:route-tree — starters/${id}/app/src/routeTree.gen.ts is stale.`
  );
  console.error(`\n  Fix: pnpm --filter ${pkg.name} generate-routes`);
  failed = true;
}

if (failed) {
  process.exit(1);
}
