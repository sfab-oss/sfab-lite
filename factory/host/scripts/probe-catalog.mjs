#!/usr/bin/env node
/**
 * Scripted hosted catalog probe (D-014 item 5).
 *
 * Default is dry-run: print the plan and create no apps.
 * `--live` is ask-first (PROBE_CATALOG_LIVE=1) and is not wired in this PR.
 *
 *   node scripts/probe-catalog.mjs
 *   node scripts/probe-catalog.mjs --dry-run --recipes lite/pdf-invoice
 */
import { runProbeCatalog } from "./probe-catalog-lib.mjs";

const code = runProbeCatalog(process.argv.slice(2), process.env, console);
process.exit(code);
