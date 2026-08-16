#!/usr/bin/env node
/**
 * Guard every Worker in the app loop against Cloudflare's plan ceiling.
 *
 * Every worker in the app loop must stay deployable; a failed prod deploy
 * must never be the first signal. Host, check, lint, and build are all
 * hard-gated: the host is a composer in that loop (CD, create, workspace
 * compile-on-save), not ordinary ungated console software.
 *
 * The number comes from `wrangler deploy --dry-run`, which reports the same
 * gzip size Cloudflare enforces at upload.
 *
 * Cloudflare states the limit as "10 MB" without saying decimal or binary.
 * We take the conservative reading (10,000,000 bytes) so a pass here is a
 * pass there.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const CEILING_BYTES = 10_000_000;
/** Fail here, not at the ceiling — a deploy that only just fits is a trap. */
const FAIL_RATIO = 0.97;
const WARN_RATIO = 0.85;

const workers = [
  { name: "factory", cwd: "factory/host" },
  { name: "check", cwd: "factory/check" },
  { name: "lint", cwd: "factory/lint" },
  { name: "build", cwd: "factory/build" },
];

let failed = false;

for (const app of workers) {
  const cwd = join(root, app.cwd);
  let out;
  try {
    out = execFileSync(
      "pnpm",
      [
        "exec",
        "wrangler",
        "deploy",
        "--dry-run",
        "--outdir",
        ".wrangler/size-check",
      ],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
  } catch (e) {
    console.error(
      `${app.cwd}: dry-run build failed\n${e.stdout ?? ""}${e.stderr ?? ""}`
    );
    failed = true;
    continue;
  }

  const m = out.match(/gzip:\s*([\d.]+)\s*KiB/);
  if (!m) {
    console.error(
      `${app.cwd}: could not parse a gzip size from wrangler output`
    );
    failed = true;
    continue;
  }

  const bytes = Math.round(Number(m[1]) * 1024);
  const ratio = bytes / CEILING_BYTES;
  const pct = (ratio * 100).toFixed(1);
  const mib = (bytes / 1024 / 1024).toFixed(2);

  if (ratio > FAIL_RATIO) {
    console.error(
      `${app.cwd}: ${mib} MiB gzip — ${pct}% of the 10 MB Worker limit. Too close to deploy safely.`
    );
    failed = true;
  } else if (ratio > WARN_RATIO) {
    console.warn(
      `${app.cwd}: ${mib} MiB gzip — ${pct}% of the 10 MB Worker limit.`
    );
  } else {
    console.log(`${app.cwd}: ${mib} MiB gzip — ${pct}%`);
  }
}

if (failed) {
  process.exit(1);
}
