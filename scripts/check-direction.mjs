#!/usr/bin/env node
/**
 * Dependency-direction allowlist.
 *
 * framework/ imports nothing outside itself.
 * registry/ and starters/ import only framework/.
 * factory/ may import everything.
 *
 * check:cycles (madge) finds cycles, not direction. This gate is the
 * one-rule map. A committed red fixture under scripts/fixtures/direction-red
 * must fail — that is the milestone *Done when*.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const FIXTURE = join(here, "fixtures/direction-red");
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies"];

const SKIP_DIR = new Set([
  "node_modules",
  "dist",
  ".git",
  ".wrangler",
  ".turbo",
  "vendor",
  "generated",
  "universe",
  "results",
]);

const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);

/** @param {string} rel */
function posixRel(rel) {
  return rel.replaceAll("\\", "/");
}

/** @param {string} rel posix-ish relative from root */
function zoneOf(rel) {
  const n = posixRel(rel);
  if (n === "framework" || n.startsWith("framework/")) {
    return "framework";
  }
  if (n === "starters" || n.startsWith("starters/")) {
    return "starters";
  }
  if (n === "registry" || n.startsWith("registry/")) {
    return "registry";
  }
  if (n === "factory" || n.startsWith("factory/")) {
    return "factory";
  }
  return null;
}

/** @param {string | null} from @param {string | null} to */
function allowed(from, to) {
  if (from == null || to == null || from === to) {
    return true;
  }
  if (from === "factory") {
    return true;
  }
  if (from === "framework") {
    return false;
  }
  if (from === "starters" || from === "registry") {
    return to === "framework";
  }
  return true;
}

function walkFiles(dir, out) {
  if (!existsSync(dir)) {
    return;
  }
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(ent.name) || ent.name.startsWith(".")) {
      continue;
    }
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      walkFiles(p, out);
    } else {
      out.push(p);
    }
  }
}

const SPEC_RE =
  /(?:from|import)\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g;

/** @param {string} src */
function specifiers(src) {
  const found = [];
  for (const m of src.matchAll(SPEC_RE)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec) {
      found.push(spec);
    }
  }
  return found;
}

function isRelative(spec) {
  return spec.startsWith("./") || spec.startsWith("../");
}

/** @param {string} rel */
function skipPkgDir(rel) {
  return (
    rel === "universe" ||
    rel.includes("/universe") ||
    rel.includes("scripts/fixtures")
  );
}

/** @param {string} file */
function readPkg(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * @param {string} root
 * @param {string[]} pkgFiles
 * @returns {Map<string, string>}
 */
function collectWorkspacePackages(root, pkgFiles) {
  /** @type {Map<string, string>} */
  const pkgNameToDir = new Map();
  for (const f of pkgFiles) {
    const rel = posixRel(relative(root, dirname(f)));
    if (skipPkgDir(rel)) {
      continue;
    }
    const pkg = readPkg(f);
    if (typeof pkg?.name === "string" && pkg.name.startsWith("@sfab-lite/")) {
      pkgNameToDir.set(pkg.name, rel === "" ? "." : rel);
    }
  }
  return pkgNameToDir;
}

/**
 * @param {string} dirRel
 * @param {string} fromZone
 * @param {Record<string, unknown>} pkg
 * @param {Map<string, string>} pkgNameToDir
 * @param {string[]} violations
 */
function checkPkgFields(dirRel, fromZone, pkg, pkgNameToDir, violations) {
  for (const field of DEP_FIELDS) {
    for (const name of Object.keys(pkg[field] ?? {})) {
      const destDir = pkgNameToDir.get(name);
      if (destDir == null) {
        continue;
      }
      const toZone = zoneOf(destDir);
      if (!allowed(fromZone, toZone)) {
        violations.push(
          `${dirRel}/package.json ${field} ${name} (${fromZone} → ${toZone})`
        );
      }
    }
  }
}

/**
 * @param {string} root
 * @param {string[]} pkgFiles
 * @param {Map<string, string>} pkgNameToDir
 * @param {string[]} violations
 */
function checkManifestDeps(root, pkgFiles, pkgNameToDir, violations) {
  for (const f of pkgFiles) {
    const dirRel = posixRel(relative(root, dirname(f)));
    if (skipPkgDir(dirRel)) {
      continue;
    }
    const fromZone = zoneOf(dirRel === "" ? "." : dirRel);
    const pkg = fromZone == null ? null : readPkg(f);
    if (fromZone == null || pkg == null) {
      continue;
    }
    checkPkgFields(dirRel, fromZone, pkg, pkgNameToDir, violations);
  }
}

/**
 * @param {string} file
 * @param {string} spec
 * @param {string} root
 * @param {Map<string, string>} pkgNameToDir
 */
function importZone(file, spec, root, pkgNameToDir) {
  if (isRelative(spec)) {
    const resolved = normalize(resolve(dirname(file), spec));
    const prefix = `${root}${sep}`;
    if (!(resolved === root || resolved.startsWith(prefix))) {
      return null;
    }
    return zoneOf(posixRel(relative(root, resolved)));
  }
  const destDir = pkgNameToDir.get(spec);
  return destDir == null ? null : zoneOf(destDir);
}

/**
 * @param {string} root
 * @param {string[]} files
 * @param {Map<string, string>} pkgNameToDir
 * @param {string[]} violations
 */
function checkSourceImports(root, files, pkgNameToDir, violations) {
  for (const f of files) {
    const rel = posixRel(relative(root, f));
    if (rel.startsWith("scripts/fixtures/")) {
      continue;
    }
    const ext = f.slice(f.lastIndexOf("."));
    if (!SOURCE_EXT.has(ext)) {
      continue;
    }
    const fromZone = zoneOf(rel);
    if (fromZone == null) {
      continue;
    }
    let src;
    try {
      src = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    for (const spec of specifiers(src)) {
      const toZone = importZone(f, spec, root, pkgNameToDir);
      if (!allowed(fromZone, toZone)) {
        violations.push(`${rel} imports ${spec} (${fromZone} → ${toZone})`);
      }
    }
  }
}

/**
 * @param {string} root
 * @returns {{ ok: boolean, violations: string[] }}
 */
function checkTree(root) {
  const files = [];
  walkFiles(root, files);
  const pkgFiles = files.filter((f) => f.endsWith("package.json"));
  const pkgNameToDir = collectWorkspacePackages(root, pkgFiles);
  const violations = [];
  checkManifestDeps(root, pkgFiles, pkgNameToDir, violations);
  checkSourceImports(root, files, pkgNameToDir, violations);
  return { ok: violations.length === 0, violations };
}

/** @param {{ ok: boolean, violations: string[] }} result */
function failViolations(result) {
  for (const v of result.violations) {
    console.error(`direction: ${v}`);
  }
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    root: { type: "string" },
  },
});
if (values.root !== undefined) {
  const root = resolve(values.root);
  if (!(root && existsSync(root))) {
    console.error("check:direction --root needs an existing directory");
    process.exit(2);
  }
  const result = checkTree(root);
  if (!result.ok) {
    failViolations(result);
  }
  console.log(`direction ok (root ${root})`);
  process.exit(0);
}

const real = checkTree(repoRoot);
if (!real.ok) {
  failViolations(real);
}

if (!(existsSync(FIXTURE) && statSync(FIXTURE).isDirectory())) {
  console.error(
    "check:direction — missing red fixture at scripts/fixtures/direction-red"
  );
  process.exit(1);
}

const red = spawnSync(
  process.execPath,
  [fileURLToPath(import.meta.url), "--root", FIXTURE],
  {
    encoding: "utf8",
  }
);
if (red.status === 0) {
  console.error(
    "check:direction — red fixture did not fail (framework → factory import must be rejected)"
  );
  process.exit(1);
}
if (red.status !== 1) {
  console.error(
    `check:direction — red fixture exited ${red.status}, expected 1\n${red.stderr}${red.stdout}`
  );
  process.exit(1);
}

console.log("direction ok (tree + red fixture)");
