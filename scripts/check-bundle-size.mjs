#!/usr/bin/env node
/**
 * Guard aux Worker upload size against Cloudflare's plan ceiling.
 *
 * Originally added because `factory/lint` sat at ~9.09 MiB gzip against a 10 MB
 * Worker limit — a Biome bump could make it undeployable with the first
 * signal a failed production deploy.
 *
 * **Factory is ordinary host software** (console + API). It is *not* gated
 * here the way the frozen template/kernel surface is: starter and platform
 * do not fail CI on host bundle size either. Size pressure that matters for
 * generated apps lives in kernel / template checks (`check:kernel`,
 * making-it-fit), not this script's factory dry-run.
 *
 * Still measured for factory (warn only). **Hard-fail only** `check` and
 * `lint` — the aux workers that must stay deployable for the app loop.
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
  { name: "factory", cwd: "factory/host", warnOnly: true },
  { name: "check", cwd: "factory/check", warnOnly: false },
  { name: "lint", cwd: "factory/lint", warnOnly: false },
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
    const line = `${app.cwd}: ${mib} MiB gzip — ${pct}% of the 10 MB Worker limit. Too close to deploy safely.`;
    if (app.warnOnly) {
      console.warn(`${line} (factory: warn-only)`);
    } else {
      console.error(line);
      failed = true;
    }
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
