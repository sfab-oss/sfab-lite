/**
 * Install (or verify) the isolated kernel universe under framework/runtime/universe.
 *
 * The universe is its own mini-workspace (universe/pnpm-workspace.yaml). We
 * install with cwd=universe so pnpm does not join the monorepo workspace and
 * cannot re-resolve optional peers from factory/ / other packages.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { PINS, UNIVERSE_EXTRA_PINS } from "./pins.mjs";
import { universePkgPath, universeRoot } from "./universe.mjs";

/** Expected direct deps in universe/package.json (must match committed manifest). */
function expectedUniverseDeps() {
  return {
    ...Object.fromEntries(
      Object.entries(PINS).map(([name, version]) => [name, version])
    ),
    ...UNIVERSE_EXTRA_PINS,
  };
}

function validateUniverseManifest() {
  const pkg = JSON.parse(readFileSync(universePkgPath, "utf8"));
  const deps = pkg.dependencies ?? {};
  const expected = expectedUniverseDeps();
  const missing = [];
  const mismatched = [];
  const unexpected = [];

  for (const [name, version] of Object.entries(expected)) {
    if (deps[name] === undefined) {
      missing.push(name);
    } else if (deps[name] !== version) {
      mismatched.push(
        `${name}: universe has ${deps[name]}, pins want ${version}`
      );
    }
  }
  for (const name of Object.keys(deps)) {
    if (expected[name] === undefined) {
      unexpected.push(name);
    }
  }

  // Hard rule: workers-types must never enter via the universe manifest.
  if (deps["@cloudflare/workers-types"] !== undefined) {
    throw new Error(
      "universe/package.json must not declare @cloudflare/workers-types — apps use cloudflare-ambient.d.ts (see README)"
    );
  }

  if (missing.length || mismatched.length || unexpected.length) {
    const lines = [
      "framework/runtime/universe/package.json is out of sync with scripts/pins.mjs:",
      ...missing.map((n) => `  missing: ${n}`),
      ...mismatched.map((m) => `  mismatch: ${m}`),
      ...unexpected.map((n) => `  unexpected: ${n}`),
    ];
    throw new Error(lines.join("\n"));
  }
}

validateUniverseManifest();

const frozen = process.argv.includes("--no-frozen")
  ? []
  : ["--frozen-lockfile"];
const result = spawnSync("pnpm", ["install", ...frozen], {
  cwd: universeRoot,
  encoding: "utf8",
  stdio: "inherit",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("kernel universe installed:", universeRoot);
