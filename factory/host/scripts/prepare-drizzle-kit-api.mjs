/**
 * Patch a copy of drizzle-kit's `api.mjs` so the schema-probe Worker Loader
 * child can import it as its own ES module (not flattened by Vite/esbuild).
 *
 * Two load-time patches from the 2026-08-16 probe, plus a third so generate
 * never hits hanji rename prompts: rewrite `drizzle-orm/*` to relative paths,
 * `createRequire("file:///probe/api.mjs")`, silent create/delete resolvers.
 *
 * Writes `.tmp/drizzle-kit/modules.json` (module path → source) for
 * `upload-drizzle-kit-r2.mjs`. Not imported by the Worker — that would put
 * 3.56 MiB into the script and blow the 10 MB gzip limit.
 *
 * Re-run when the pinned drizzle-kit / drizzle-orm versions change.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptPath = fileURLToPath(import.meta.url);
const hostRoot = join(dirname(scriptPath), "..");
const tmpDir = join(hostRoot, ".tmp/drizzle-kit");
const outPath = join(tmpDir, "modules.json");
const stampPath = join(tmpDir, "stamp.json");
const PINNED_KIT = "0.31.10";
const PINNED_ORM = "0.45.2";

const ORM_SPEC = "drizzle-orm";

const STATIC_ORM = {
  "drizzle-orm": "index.js",
  "drizzle-orm/casing": "casing.js",
  "drizzle-orm/relations": "relations.js",
  "drizzle-orm/pg-core": "pg-core/index.js",
  "drizzle-orm/sqlite-core": "sqlite-core/index.js",
  "drizzle-orm/mysql-core": "mysql-core/index.js",
  "drizzle-orm/singlestore-core": "singlestore-core/index.js",
};

const SILENT_RESOLVERS = `
tablesResolver = async (input) => ({
  created: input.created,
  deleted: input.deleted,
  renamed: [],
  moved: [],
});
columnsResolver = async (input) => ({
  tableName: input.tableName,
  schema: input.schema,
  created: input.created,
  deleted: input.deleted,
  renamed: [],
});
sqliteViewsResolver = async (input) => ({
  created: input.created,
  deleted: input.deleted,
  renamed: [],
  moved: [],
});
`;

function pkgFile(spec) {
  return require.resolve(spec);
}

function kitApiFile() {
  const indexJs = require.resolve("drizzle-kit");
  const api = join(dirname(indexJs), "api.mjs");
  if (!existsSync(api)) {
    throw new Error(`prepare-drizzle-kit-api: missing ${api}`);
  }
  return api;
}

function toPosix(p) {
  return p.split(sep).join("/");
}

function patchApi(source) {
  let next = source;
  if (!next.includes("createRequire(import.meta.url)")) {
    throw new Error(
      "prepare-drizzle-kit-api: expected createRequire(import.meta.url)"
    );
  }
  next = next.replace(
    "createRequire(import.meta.url)",
    'createRequire("file:///probe/api.mjs")'
  );

  const importRe = /from\s+["'](drizzle-orm(?:\/[^"']+)?)["']/g;
  const seen = new Set();
  next = next.replace(importRe, (_full, spec) => {
    const rel = STATIC_ORM[spec];
    if (!rel) {
      throw new Error(
        `prepare-drizzle-kit-api: unmapped static drizzle-orm import ${spec}`
      );
    }
    seen.add(spec);
    return `from ${JSON.stringify(`./vendor/drizzle-orm/${rel}`)}`;
  });
  if (!(seen.has("drizzle-orm") && seen.has("drizzle-orm/sqlite-core"))) {
    throw new Error(
      `prepare-drizzle-kit-api: missing expected imports (${[...seen].join(", ")})`
    );
  }

  const promptPatches = [
    [
      "promptNamedWithSchemasConflict = async (newItems, missingItems, entity) => {\n      if (missingItems.length === 0 || newItems.length === 0) {",
      "promptNamedWithSchemasConflict = async (newItems, missingItems, entity) => {\n      if (true) {",
    ],
    [
      "promptNamedConflict = async (newItems, missingItems, entity) => {\n      if (missingItems.length === 0 || newItems.length === 0) {",
      "promptNamedConflict = async (newItems, missingItems, entity) => {\n      if (true) {",
    ],
    [
      "promptColumnsConflicts = async (tableName, newColumns, missingColumns) => {\n      if (newColumns.length === 0 || missingColumns.length === 0) {",
      "promptColumnsConflicts = async (tableName, newColumns, missingColumns) => {\n      if (true) {",
    ],
  ];
  for (const [from, to] of promptPatches) {
    if (!next.includes(from)) {
      throw new Error(
        `prepare-drizzle-kit-api: prompt patch target missing: ${from.slice(0, 48)}`
      );
    }
    next = next.replace(from, to);
  }

  next = `${next}\n${SILENT_RESOLVERS}`;
  return next;
}

const RELATIVE_IMPORT_RE =
  /(?:from|import)\s*["'](\.[^"']+)["']|import\s*\(\s*["'](\.[^"']+)["']\s*\)/g;

function relativeImports(source) {
  const found = [];
  for (const match of source.matchAll(RELATIVE_IMPORT_RE)) {
    const spec = match[1] ?? match[2];
    if (spec) {
      found.push(spec);
    }
  }
  return found;
}

function resolveJs(fromFile, spec) {
  const dir = dirname(fromFile);
  const raw = join(dir, spec);
  const candidates = [raw, `${raw}.js`, join(raw, "index.js")];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) {
      return c;
    }
  }
  return null;
}

function collectOrmClosure(ormRoot, entryRelPaths) {
  const files = new Map();
  const queue = [...entryRelPaths.map((rel) => join(ormRoot, rel))];
  while (queue.length > 0) {
    const abs = queue.pop();
    if (!abs || files.has(abs)) {
      continue;
    }
    if (!existsSync(abs)) {
      throw new Error(`prepare-drizzle-kit-api: missing ${abs}`);
    }
    const source = readFileSync(abs, "utf8");
    files.set(abs, source);
    for (const spec of relativeImports(source)) {
      const next = resolveJs(abs, spec);
      if (next) {
        queue.push(next);
      }
    }
  }
  return files;
}

const kitApiPath = kitApiFile();
const ormIndex = pkgFile(ORM_SPEC);
const ormRoot = dirname(ormIndex);
const kitPkg = JSON.parse(
  readFileSync(join(dirname(kitApiPath), "package.json"), "utf8")
);
if (kitPkg.version !== PINNED_KIT) {
  throw new Error(
    `prepare-drizzle-kit-api: expected drizzle-kit ${PINNED_KIT}, got ${kitPkg.version}`
  );
}
const ormPkg = JSON.parse(readFileSync(join(ormRoot, "package.json"), "utf8"));
if (ormPkg.version !== PINNED_ORM) {
  throw new Error(
    `prepare-drizzle-kit-api: expected drizzle-orm ${PINNED_ORM}, got ${ormPkg.version}`
  );
}
const stamp = {
  drizzleKit: kitPkg.version,
  drizzleOrm: ormPkg.version,
  script: createHash("sha256").update(readFileSync(scriptPath)).digest("hex"),
};
if (existsSync(outPath) && existsSync(stampPath)) {
  try {
    const previous = JSON.parse(readFileSync(stampPath, "utf8"));
    if (
      previous.drizzleKit === stamp.drizzleKit &&
      previous.drizzleOrm === stamp.drizzleOrm &&
      previous.script === stamp.script
    ) {
      console.log("prepare-drizzle-kit-api: up to date");
      process.exit(0);
    }
  } catch {
    // Rewrite when the stamp is unreadable.
  }
}

const apiSource = patchApi(readFileSync(kitApiPath, "utf8"));
const ormFiles = collectOrmClosure(ormRoot, Object.values(STATIC_ORM));

/** @type {Record<string, string>} */
const modules = { "api.mjs": apiSource };
for (const [abs, source] of ormFiles) {
  const rel = toPosix(relative(ormRoot, abs));
  modules[`vendor/drizzle-orm/${rel}`] = source;
}

mkdirSync(tmpDir, { recursive: true });
writeFileSync(outPath, `${JSON.stringify(modules)}\n`);
writeFileSync(stampPath, `${JSON.stringify(stamp, null, 2)}\n`);
const bytes = Buffer.byteLength(JSON.stringify(modules));
console.log(
  `prepare-drizzle-kit-api: ${Object.keys(modules).length} modules, ${(bytes / 1_048_576).toFixed(2)} MiB → ${toPosix(relative(hostRoot, outPath))}`
);
