#!/usr/bin/env node
/**
 * Isolated install of pdf-lib@1.17.1, esbuild to one ESM (P3 flags), write
 * the committed catalog artifact + generated core catalog JSON.
 *
 * Drift-gated by check:modules. Do not import the ESM from the host Worker.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const NAME = "pdf-lib";
const VERSION = "1.17.1";
const PIN = `${NAME}@${VERSION}`;
const ESBUILD_PIN = "0.28.1";
const LOADER_KEY = "pdf-lib.js";
const ESM_FILE = "pdf-lib.esm.js";
const STUB_VFS_PATH = "/node_modules/pdf-lib/index.d.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const artifactDir = join(repoRoot, "framework/modules", PIN);
const stubPath = join(artifactDir, "index.d.ts");
const catalogJsonPath = join(
  repoRoot,
  "framework/toolchain/src/generated/catalog-modules.json"
);
const universeEsbuild = join(
  repoRoot,
  "framework/runtime/universe/node_modules/esbuild/bin/esbuild"
);
const ensureUniverse = join(
  repoRoot,
  "framework/runtime/scripts/ensure-universe.mjs"
);

const outFlag = process.argv.find((arg) => arg.startsWith("--out-dir="));
const outDir = outFlag ? outFlag.slice("--out-dir=".length) : artifactDir;
const catalogOutFlag = process.argv.find((arg) =>
  arg.startsWith("--catalog-json=")
);
const catalogOut = catalogOutFlag
  ? catalogOutFlag.slice("--catalog-json=".length)
  : catalogJsonPath;

function sha256(buf) {
  return `sha256:${createHash("sha256").update(buf).digest("hex")}`;
}

function run(cmd, args, opts) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    ...opts,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    process.stdout.write(result.stdout ?? "");
    throw new Error(`${cmd} ${args.join(" ")} failed`);
  }
  return result;
}

if (!existsSync(stubPath)) {
  console.error(`build-pdf-lib — missing stub ${stubPath}`);
  process.exit(1);
}

if (!existsSync(universeEsbuild)) {
  const ensured = spawnSync(process.execPath, [ensureUniverse], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (ensured.status !== 0) {
    process.exit(ensured.status ?? 1);
  }
}

const esbuildVersion = run(universeEsbuild, ["--version"], {
  encoding: "utf8",
}).stdout.trim();
if (esbuildVersion !== ESBUILD_PIN) {
  console.error(
    `build-pdf-lib — expected esbuild ${ESBUILD_PIN} from kernel universe, got ${esbuildVersion}`
  );
  process.exit(1);
}

const scratch = mkdtempSync(join(tmpdir(), "sfab-pdf-lib-"));
const isolated = join(scratch, "isolated");
mkdirSync(isolated);

try {
  writeFileSync(
    join(isolated, "package.json"),
    `${JSON.stringify({ name: "sfab-pdf-lib-isolated", private: true }, null, 2)}\n`
  );
  run("npm", ["install", "--ignore-scripts", "--save-exact", PIN], {
    cwd: isolated,
    stdio: "inherit",
  });

  const outfile = join(scratch, ESM_FILE);
  run(
    universeEsbuild,
    [
      NAME,
      "--bundle",
      "--format=esm",
      "--platform=neutral",
      "--target=es2022",
      "--conditions=workerd,worker,browser,import,module,default",
      "--main-fields=module,browser,main",
      `--outfile=${outfile}`,
    ],
    { cwd: isolated, stdio: "inherit" }
  );

  const esm = readFileSync(outfile);
  const stub = readFileSync(stubPath, "utf8");
  const gzipBytes = gzipSync(esm, { level: 9 }).length;
  const manifest = {
    name: NAME,
    version: VERSION,
    plane: "server",
    runtime: "^0",
    loaderKey: LOADER_KEY,
    esmFile: ESM_FILE,
    stubPath: STUB_VFS_PATH,
    rawBytes: esm.length,
    gzipBytes,
    stubBytes: Buffer.byteLength(stub, "utf8"),
    sha256: sha256(esm),
    stubSha256: sha256(Buffer.from(stub, "utf8")),
    esbuild: ESBUILD_PIN,
    evidence: [
      "docs/engineering/making-it-fit.md",
      "docs/decisions/0016-catalog-modules-r2-and-typed-stubs.md",
    ],
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, ESM_FILE), esm);
  writeFileSync(join(outDir, "index.d.ts"), stub);
  writeFileSync(
    join(outDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  const catalog = {
    runtimeLine: "^0",
    modules: [
      {
        ...manifest,
        stub,
      },
    ],
  };
  mkdirSync(dirname(catalogOut), { recursive: true });
  writeFileSync(catalogOut, `${JSON.stringify(catalog, null, 2)}\n`);

  console.log(
    `build-pdf-lib — ${PIN} raw ${esm.length} gzip-9 ${gzipBytes} stub ${manifest.stubBytes}`
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
