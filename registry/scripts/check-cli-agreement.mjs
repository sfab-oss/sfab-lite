#!/usr/bin/env node
/**
 * Cheap-vs-real registry agreement: the real shadcn CLI (pinned) adding
 * every published recipe from our served /r/{name}.json must place files
 * byte-identical to planAdd.
 *
 * CI-only (installs a scratch project and runs the CLI). Pin: shadcn@4.17.0.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG } from "../src/catalog.ts";
import {
  catalogNames,
  planAdd,
  serveSlug,
  stripBiomeIgnoreAllHeaders,
  toBuiltRegistryItem,
} from "../src/lite.ts";

function snapshotTree(root, prefix = "") {
  const out = {};
  if (!existsSync(root)) {
    return out;
  }
  for (const name of readdirSync(root).sort()) {
    if (name === "node_modules") {
      continue;
    }
    const abs = join(root, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(abs).isDirectory()) {
      Object.assign(out, snapshotTree(abs, rel));
    } else {
      out[rel] = readFileSync(abs, "utf8");
    }
  }
  return out;
}

const PINNED_CLI = "4.17.0";
const RE_SERVED_ITEM = /^\/r\/(.+)\.json$/;
const registryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRegistry = join(registryRoot, "registry.json");
const pkg = JSON.parse(
  readFileSync(join(registryRoot, "package.json"), "utf8")
);
const installed = pkg.devDependencies?.shadcn;
if (installed !== PINNED_CLI) {
  console.error(
    `check:registry-agreement — expected shadcn@${PINNED_CLI} in registry/package.json, got ${installed}`
  );
  process.exit(1);
}

function shadcnSync(args) {
  return spawnSync("pnpm", ["exec", "shadcn", ...args], {
    cwd: registryRoot,
    encoding: "utf8",
    env: { ...process.env, npm_config_yes: "true" },
  });
}

function shadcn(args) {
  // spawn, not spawnSync: the local /r/ server lives in this process and
  // cannot answer while the event loop is blocked.
  return new Promise((resolve) => {
    const child = spawn("pnpm", ["exec", "shadcn", ...args], {
      cwd: registryRoot,
      env: { ...process.env, npm_config_yes: "true" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

const validated = shadcnSync(["registry", "validate", sourceRegistry]);
if (validated.status !== 0) {
  process.stderr.write(validated.stderr);
  process.stdout.write(validated.stdout);
  console.error("check:registry-agreement — shadcn registry validate failed");
  process.exit(validated.status ?? 1);
}

const built = new Map();
for (const name of catalogNames(CATALOG)) {
  const entry = CATALOG.items[name];
  built.set(
    serveSlug(name),
    `${JSON.stringify(toBuiltRegistryItem(entry), null, 2)}\n`
  );
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const match = url.pathname.match(RE_SERVED_ITEM);
  const body = match ? built.get(match[1]) : undefined;
  if (!body) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "unknown_item" }));
    return;
  }
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(body);
});

await new Promise((resolve) => {
  server.listen(0, "127.0.0.1", resolve);
});
const { port } = server.address();
const registryUrl = `http://127.0.0.1:${port}/r/{name}.json`;

const scratch = mkdtempSync(join(tmpdir(), "lite-registry-agreement-"));
const failures = [];

try {
  writeFileSync(
    join(scratch, "package.json"),
    `${JSON.stringify({ name: "lite-registry-agreement", private: true, type: "module" }, null, 2)}\n`
  );
  writeFileSync(
    join(scratch, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          baseUrl: ".",
          paths: { "@/*": ["./src/*"] },
          jsx: "react-jsx",
          module: "ESNext",
          moduleResolution: "bundler",
        },
      },
      null,
      2
    )}\n`
  );
  mkdirSync(join(scratch, "src"), { recursive: true });
  writeFileSync(join(scratch, "src/styles.css"), "/* agreement scratch */\n");
  writeFileSync(
    join(scratch, "components.json"),
    `${JSON.stringify(
      {
        $schema: "https://ui.shadcn.com/schema.json",
        style: "base-vega",
        rsc: false,
        tsx: true,
        tailwind: {
          config: "",
          css: "src/styles.css",
          baseColor: "neutral",
          cssVariables: true,
        },
        iconLibrary: "radix",
        aliases: {
          components: "@/components",
          utils: "@/lib/utils",
          ui: "@/components/ui",
          lib: "@/lib",
          hooks: "@/hooks",
        },
        registries: { "@lite": registryUrl },
      },
      null,
      2
    )}\n`
  );

  for (const name of catalogNames(CATALOG)) {
    const planned = planAdd(name, CATALOG, {});
    if (!planned.ok) {
      failures.push(`${name}: planAdd failed: ${planned.error}`);
      continue;
    }
    const slug = serveSlug(name);
    rmSync(join(scratch, "src/components"), { recursive: true, force: true });
    rmSync(join(scratch, "src/lib"), { recursive: true, force: true });
    const before = snapshotTree(scratch);
    const added = await shadcn([
      "add",
      `@lite/${slug}`,
      "--yes",
      "--overwrite",
      "--cwd",
      scratch,
    ]);
    if (added.status !== 0) {
      failures.push(
        `${name}: shadcn add @lite/${slug} failed\n${added.stdout}\n${added.stderr}`
      );
      continue;
    }
    for (const [path, content] of Object.entries(planned.writes)) {
      let onDisk;
      try {
        onDisk = readFileSync(join(scratch, path), "utf8");
      } catch {
        failures.push(`${name}: CLI did not write ${path}`);
        continue;
      }
      if (
        stripBiomeIgnoreAllHeaders(onDisk) !==
        stripBiomeIgnoreAllHeaders(content)
      ) {
        failures.push(`${name}: ${path} differs from planAdd`);
      }
    }
    const after = snapshotTree(scratch);
    for (const [path, content] of Object.entries(after)) {
      if (before[path] === content) {
        continue;
      }
      if (Object.hasOwn(planned.writes, path)) {
        continue;
      }
      failures.push(`${name}: CLI wrote extra ${path}`);
    }
  }
} finally {
  server.close();
  rmSync(scratch, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(
    "check:registry-agreement — CLI placement drifted from planAdd:"
  );
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  process.exit(1);
}

console.log(
  `registry-agreement ok: shadcn@${PINNED_CLI} add matches planAdd for ${catalogNames(CATALOG).length} recipes`
);
