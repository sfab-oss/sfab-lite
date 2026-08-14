/**
 * tsgo / TypeScript native preview on the same VFS+seed tree the check
 * worker sees. Forecast only — the repo pin stays 6.0.3.
 *
 *   node scripts/run-measure.mjs measure-tsgo.ts
 *
 * Writes TYPES_VFS + seed to a temp dir, then runs tsc 6.0.3 and tsgo
 * --noEmit. Memory is process RSS from /usr/bin/time, not LanguageService
 * heapUsed, so do not compare these megabytes to measure-entities.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TYPES_VFS } from "@sfab-lite/kernel";
import seed from "@sfab-lite/template/seed" with { type: "json" };

const LEADING_SLASH = /^\//;
const TIME_MAX_RSS = /Maximum resident set size \(kbytes\): (\d+)/;
const TIME_USER_SEC = /User time \(seconds\): ([\d.]+)/;
const TSC_ERROR = /error TS\d+/;

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");
const repoRoot = join(appRoot, "../..");
const tscBin = join(
  repoRoot,
  "framework/runtime/universe/node_modules/typescript/bin/tsc"
);
const outRoot = join(appRoot, ".tmp/tsgo-forecast");
const tsgoRoot = join(appRoot, ".tmp/tsgo-pkg");

function materialize(): void {
  rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(outRoot, { recursive: true });
  for (const [key, text] of Object.entries(TYPES_VFS)) {
    const abs = join(outRoot, key.replace(LEADING_SLASH, ""));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  }
  for (const [path, text] of Object.entries(
    seed.sourceFiles as Record<string, string>
  )) {
    if (!(path.endsWith(".ts") || path.endsWith(".tsx"))) {
      continue;
    }
    const abs = join(outRoot, "app", path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  }
  writeFileSync(
    join(outRoot, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          strict: true,
          skipLibCheck: true,
          jsx: "react-jsx",
          noLib: true,
          noEmit: true,
          allowJs: false,
          esModuleInterop: true,
          isolatedModules: true,
          allowImportingTsExtensions: true,
          typeRoots: [],
          types: [],
        },
        include: [
          "app/**/*.ts",
          "app/**/*.tsx",
          "libs/**/*.d.ts",
          "types/**/*.d.ts",
        ],
      },
      null,
      2
    )}\n`
  );
}

function findTsgo(): string | null {
  const candidates = [
    join(tsgoRoot, "node_modules/@typescript/native-preview/bin/tsgo"),
    join(tsgoRoot, "node_modules/.bin/tsgo"),
    join(tsgoRoot, "node_modules/.bin/tsgo.js"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      return c;
    }
  }
  return null;
}

function installTsgo(): { ok: boolean; detail: string } {
  mkdirSync(tsgoRoot, { recursive: true });
  if (!existsSync(join(tsgoRoot, "package.json"))) {
    writeFileSync(
      join(tsgoRoot, "package.json"),
      `${JSON.stringify({ name: "tsgo-forecast", private: true }, null, 2)}\n`
    );
  }
  const install = spawnSync(
    "npm",
    ["install", "@typescript/native-preview", "--no-fund", "--no-audit"],
    { cwd: tsgoRoot, encoding: "utf8" }
  );
  if (install.status !== 0) {
    return {
      ok: false,
      detail: (install.stderr || install.stdout || "npm install failed").slice(
        0,
        2000
      ),
    };
  }
  return { ok: true, detail: "installed @typescript/native-preview" };
}

function runTimed(
  label: string,
  command: string,
  args: string[]
): Record<string, unknown> {
  const timeBin = existsSync("/usr/bin/time") ? "/usr/bin/time" : null;
  const t0 = Date.now();
  if (timeBin) {
    const run = spawnSync(timeBin, ["-v", command, ...args], {
      cwd: outRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=8192" },
    });
    const log = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
    const maxRssKb = TIME_MAX_RSS.exec(log);
    const userSec = TIME_USER_SEC.exec(log);
    return {
      label,
      command: [command, ...args].join(" "),
      status: run.status,
      ms: Date.now() - t0,
      maxRssMb: maxRssKb
        ? Number((Number(maxRssKb[1]) / 1024).toFixed(0))
        : null,
      userSec: userSec ? Number(userSec[1]) : null,
      diagLineCount: (run.stdout ?? "")
        .split("\n")
        .filter((l) => TSC_ERROR.test(l)).length,
      tail: log.trim().split("\n").slice(-12),
    };
  }
  const run = spawnSync(command, args, {
    cwd: outRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=8192" },
  });
  return {
    label,
    command: [command, ...args].join(" "),
    status: run.status,
    ms: Date.now() - t0,
    maxRssMb: null,
    stdoutTail: (run.stdout ?? "").trim().split("\n").slice(-8),
    stderrTail: (run.stderr ?? "").trim().split("\n").slice(-8),
  };
}

materialize();
console.log(
  JSON.stringify({
    label: "materialized",
    vfsFiles: Object.keys(TYPES_VFS).length,
    outRoot,
  })
);

const tscRow = runTimed("tsc 6.0.3 --noEmit", tscBin, [
  "--noEmit",
  "-p",
  "tsconfig.json",
]);
console.log(JSON.stringify(tscRow));

let tsgoBin = findTsgo();
if (!tsgoBin) {
  const installed = installTsgo();
  console.log(JSON.stringify({ label: "tsgo install", ...installed }));
  tsgoBin = findTsgo();
}

if (tsgoBin) {
  const tsgoRow = runTimed("tsgo --noEmit", tsgoBin, [
    "--noEmit",
    "-p",
    "tsconfig.json",
  ]);
  console.log(JSON.stringify(tsgoRow));
  if (
    typeof tscRow.maxRssMb === "number" &&
    typeof tsgoRow.maxRssMb === "number" &&
    tsgoRow.maxRssMb > 0
  ) {
    console.log(
      JSON.stringify({
        label: "ratio tsc/tsgo RSS",
        tscMaxRssMb: tscRow.maxRssMb,
        tsgoMaxRssMb: tsgoRow.maxRssMb,
        ratio: Number((tscRow.maxRssMb / tsgoRow.maxRssMb).toFixed(2)),
      })
    );
  }
} else {
  console.log(
    JSON.stringify({
      label: "tsgo",
      status: "blocked",
      reason: "native-preview binary not found after npm install",
    })
  );
}
