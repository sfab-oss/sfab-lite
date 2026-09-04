#!/usr/bin/env node
/**
 * Isolated npm install + esbuild (P3 flags) for one catalog pin.
 * Writes framework/modules/<name>@<version>/ only. Does not write
 * catalog-modules.json — that is assemble-catalog.mjs (union of all pins).
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
import { ESBUILD_PIN, findPin, pinSpec } from "./pins.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const universeEsbuild = join(
  repoRoot,
  "framework/runtime/universe/node_modules/esbuild/bin/esbuild"
);
const ensureUniverse = join(
  repoRoot,
  "framework/runtime/scripts/ensure-universe.mjs"
);

const pinFlag = process.argv.find((arg) => arg.startsWith("--pin="));
const spec = pinFlag ? pinFlag.slice("--pin=".length) : "";
const pin = findPin(spec);
if (!pin) {
  console.error(
    `build-module — pass --pin=<name>@<version> from the catalog allowlist (got ${spec || "(missing)"})`
  );
  process.exit(1);
}

const PIN = pinSpec(pin);
const artifactDir = join(repoRoot, "framework/modules", PIN);
const stubPath = join(artifactDir, "surface.d.ts");
const outFlag = process.argv.find((arg) => arg.startsWith("--out-dir="));
const outDir = outFlag ? outFlag.slice("--out-dir=".length) : artifactDir;

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
  console.error(`build-module — missing surface ${stubPath}`);
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
    `build-module — expected esbuild ${ESBUILD_PIN} from kernel universe, got ${esbuildVersion}`
  );
  process.exit(1);
}

const scratch = mkdtempSync(join(tmpdir(), `sfab-${pin.name}-`));
const isolated = join(scratch, "isolated");
mkdirSync(isolated);

try {
  writeFileSync(
    join(isolated, "package.json"),
    `${JSON.stringify({ name: `sfab-${pin.name}-isolated`, private: true }, null, 2)}\n`
  );
  run("npm", ["install", "--ignore-scripts", "--save-exact", PIN], {
    cwd: isolated,
    stdio: "inherit",
  });

  const outfile = join(scratch, pin.esmFile);
  run(
    universeEsbuild,
    [
      pin.name,
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
    name: pin.name,
    version: pin.version,
    plane: "server",
    runtime: "^0",
    loaderKey: pin.loaderKey,
    esmFile: pin.esmFile,
    stubPath: pin.stubVfsPath,
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
    reexportDefault: pin.reexportDefault === true,
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, pin.esmFile), esm);
  writeFileSync(join(outDir, "surface.d.ts"), stub);
  writeFileSync(
    join(outDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  console.log(
    `build-module — ${PIN} raw ${esm.length} gzip-9 ${gzipBytes} stub ${manifest.stubBytes}`
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
