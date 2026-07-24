#!/usr/bin/env node
/**
 * Bake the template payload into a JSON seed.
 *
 * The factory host is a Worker: it has no filesystem, so the source tree a
 * new app starts as cannot be read at runtime — it has to be a constant in
 * the factory bundle. This script produces that constant, reading every path
 * from `manifest.json` rather than re-hardcoding them.
 *
 * Output (stdout, or `--out=<file>`):
 *   {
 *     "manifest":    the manifest, verbatim, so consumers need not re-read it
 *     "sourceFiles": { "<path relative to app/>": "<contents>" }
 *     "migrations":  [{ "id": "0001_auth", "sql": "…" }]
 *   }
 *
 * Compiled output (server bundle, client assets) is deliberately not here.
 * That is the factory's job at publish time; this is only the source seed.
 *
 * Usage:
 *   pnpm --filter @sfab-lite/template pack
 *   pnpm --filter @sfab-lite/template pack -- --out=seed.json
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(
  readFileSync(join(packageRoot, "manifest.json"), "utf8")
);
const appRoot = join(packageRoot, manifest.root);

function arg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

/** Collect `dir` recursively, keyed by path relative to the app root. */
function walk(dir, prefix, into) {
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(abs).isDirectory()) {
      walk(abs, rel, into);
    } else if (manifest.source.extensions.includes(extname(name))) {
      into[rel] = readFileSync(abs, "utf8");
    }
  }
}

/** @type {Record<string, string>} */
const sourceFiles = {};
for (const dir of manifest.source.dirs) {
  walk(join(appRoot, dir), dir, sourceFiles);
}
for (const file of manifest.source.files) {
  sourceFiles[file] = readFileSync(join(appRoot, file), "utf8");
}
// Standalone-only scaffolding (the `wrangler dev` entry, the Vite HTML
// shell): the factory builds its own, and shipping ours would leave dead
// files in every app's source tree.
for (const file of manifest.source.exclude) {
  delete sourceFiles[file];
}

const migrations = readdirSync(join(appRoot, manifest.migrations))
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => ({
    id: f.slice(0, -".sql".length),
    sql: readFileSync(join(appRoot, manifest.migrations, f), "utf8"),
  }));

// The entries are what the factory compiles against. A payload missing one
// of them still packs fine and then fails deep inside a build, so fail here.
const required = [
  manifest.server.entry,
  manifest.client.entry,
  manifest.client.styles,
  manifest.safelist,
];
const missing = required.filter((path) => !(path in sourceFiles));
if (missing.length > 0) {
  console.error(`pack: entries missing from payload: ${missing.join(", ")}`);
  process.exit(1);
}
if (migrations.length === 0) {
  console.error(`pack: no migrations found in ${manifest.migrations}/`);
  process.exit(1);
}

const seed = { manifest, sourceFiles, migrations };
const json = `${JSON.stringify(seed, null, 2)}\n`;
const out = arg("out");
if (out) {
  writeFileSync(out, json);
  console.error(
    `pack: ${Object.keys(sourceFiles).length} files, ${migrations.length} migrations → ${out}`
  );
} else {
  process.stdout.write(json);
}
