/**
 * Serve / upload diet probes — not a check-cap experiment.
 *
 *   node scripts/measure-serve-diet.mjs
 *
 * Measures gzip of committed vendor chunks, esbuild minify on client chunks,
 * better-auth plugins barrel vs organization deep import, zod.js gzip.
 * Does not add zod-compiler to the app import map.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const kernelRoot = join(repoRoot, "framework/runtime");
const vendor = join(kernelRoot, "vendor");
const clientDir = join(vendor, "client");
const esbuild = join(kernelRoot, "universe/node_modules/esbuild/bin/esbuild");
const universeRoot = join(kernelRoot, "universe");
const tmp = join(here, "../.tmp/serve-diet");

mkdirSync(tmp, { recursive: true });

function gzipBytes(buf) {
  return gzipSync(buf, { level: 9 }).length;
}

function kb(n) {
  return Number((n / 1024).toFixed(1));
}

const kernel = JSON.parse(
  readFileSync(join(kernelRoot, "kernel.json"), "utf8")
);

console.log(
  JSON.stringify({
    label: "kernel.json gzip (committed)",
    server: kernel.sizesGzip,
    client: kernel.clientSizesGzip,
    betterAuthRaw: kernel.sizesRaw["better-auth"],
    betterAuthGzip: kernel.sizesGzip["better-auth.js"],
    zodRaw: kernel.sizesRaw.zod,
    zodGzip: kernel.sizesGzip["zod.js"],
    clientUnminifiedNote: "browserShared has no minify: true",
    authVendorEntry:
      "scripts/vendor-entries/better-auth.mjs already re-exports betterAuth + drizzleAdapter + organization — not a whole-package dump at the entry",
  })
);

const clientFiles = [
  "react.js",
  "jsx-runtime.js",
  "react-dom.js",
  "react-dom-client.js",
  "tanstack-router.js",
  "tanstack-query.js",
  "radix-icons.js",
  "clsx.js",
  "cva.js",
  "tailwind-merge.js",
  "hono-client.js",
  "better-auth-client.js",
  "base-ui-react.js",
];

function minifyFile(srcPath, outfile) {
  const run = spawnSync(
    esbuild,
    [
      srcPath,
      "--minify",
      "--format=esm",
      "--platform=browser",
      `--outfile=${outfile}`,
    ],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  return run;
}

const minifySummary = [];
let clientGzipNow = 0;
let clientGzipMin = 0;
for (const file of clientFiles) {
  const srcPath = join(clientDir, file);
  const src = readFileSync(srcPath);
  const nowG = gzipBytes(src);
  clientGzipNow += nowG;
  const outfile = join(tmp, `min-${file}`);
  const run = minifyFile(srcPath, outfile);
  if (run.status !== 0) {
    minifySummary.push({ file, error: (run.stderr || "").slice(0, 400) });
    continue;
  }
  const out = readFileSync(outfile);
  const minG = gzipBytes(out);
  clientGzipMin += minG;
  minifySummary.push({
    file,
    rawNow: src.length,
    rawMin: out.length,
    gzipNow: nowG,
    gzipMin: minG,
    gzipSaved: nowG - minG,
  });
}
console.log(
  JSON.stringify({
    label: "client minify probe (esbuild --minify on committed chunks)",
    files: minifySummary,
    clientGzipNow,
    clientGzipMin,
    gzipSaved: clientGzipNow - clientGzipMin,
    gzipSavedKb: kb(clientGzipNow - clientGzipMin),
  })
);

const committedAuth = readFileSync(join(vendor, "better-auth.js"));
const authMinOut = join(tmp, "better-auth.min.js");
const authMin = spawnSync(
  esbuild,
  [
    join(vendor, "better-auth.js"),
    "--minify",
    "--format=esm",
    `--outfile=${authMinOut}`,
  ],
  { encoding: "utf8" }
);
console.log(
  JSON.stringify({
    label: "server better-auth.js minify",
    status: authMin.status,
    committedRaw: committedAuth.length,
    committedGzip: gzipBytes(committedAuth),
    minRaw: authMin.status === 0 ? readFileSync(authMinOut).length : null,
    minGzip: authMin.status === 0 ? gzipBytes(readFileSync(authMinOut)) : null,
    stderr: (authMin.stderr || "").slice(0, 400),
  })
);

function bundleEntry(name, source) {
  const entry = join(universeRoot, `.diet-${name}.entry.mjs`);
  const outfile = join(tmp, `${name}.js`);
  writeFileSync(entry, source);
  const run = spawnSync(
    esbuild,
    [
      entry,
      "--bundle",
      "--format=esm",
      "--platform=neutral",
      "--target=es2022",
      "--conditions=workerd,worker,browser,import,module,default",
      "--external:node:*",
      "--external:cloudflare:*",
      "--external:drizzle-orm",
      "--external:drizzle-orm/*",
      `--outfile=${outfile}`,
    ],
    { cwd: universeRoot, encoding: "utf8" }
  );
  try {
    unlinkSync(entry);
  } catch {
    /* ignore */
  }
  return {
    name,
    status: run.status,
    raw: run.status === 0 ? readFileSync(outfile).length : null,
    gzip: run.status === 0 ? gzipBytes(readFileSync(outfile)) : null,
    stderr: (run.stderr || "").slice(0, 800),
  };
}

console.log(
  JSON.stringify({
    label: "better-auth plugin surface",
    committedVendor: {
      raw: committedAuth.length,
      gzip: gzipBytes(committedAuth),
    },
    sameEntryAsPrebuild: bundleEntry(
      "auth-same-entry",
      `export { betterAuth } from "better-auth";
export { drizzleAdapter } from "better-auth/adapters/drizzle";
export { organization } from "better-auth/plugins";
`
    ),
    organizationDeep: bundleEntry(
      "auth-org-deep",
      `export { betterAuth } from "better-auth";
export { drizzleAdapter } from "better-auth/adapters/drizzle";
export { organization } from "better-auth/plugins/organization";
`
    ),
    organizationOnly: bundleEntry(
      "auth-org-only",
      `export { organization } from "better-auth/plugins/organization";
`
    ),
  })
);

const zod = readFileSync(join(vendor, "zod.js"));
console.log(
  JSON.stringify({
    label: "zod vendor (runtime, not check heap)",
    raw: zod.length,
    gzip: gzipBytes(zod),
    note: "shared-only check is already 53 MB; Zod is not the check-cap lever. zod-compiler stays pack-time inspiration — not an import-map package.",
  })
);

const npmView = spawnSync(
  "npm",
  ["view", "zod-compiler", "name", "version", "description"],
  { encoding: "utf8" }
);
console.log(
  JSON.stringify({
    label: "zod-compiler npm view (not installed into the app)",
    status: npmView.status,
    stdout: (npmView.stdout || "").trim().slice(0, 500),
    stderr: (npmView.stderr || "").trim().slice(0, 500),
  })
);
