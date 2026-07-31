/**
 * Would splitting the check into client and server programs fit in 128 MB?
 *
 * Today one program is rooted at every `/app` source, so it holds the union of
 * both halves' type closures — react + tanstack + base-ui *and* drizzle +
 * better-auth + hono. Rooting each half separately and checking them in
 * sequence makes the peak the larger half rather than the union.
 *
 * Reports loaded files and retained heap for union / client-only / server-only,
 * each in isolation, so the three are directly comparable.
 *
 * Bundled by the companion .mjs runner so Node can load workspace TS.
 */

import { TYPES_VFS } from "@sfab-lite/kernel";
import seed from "@sfab-lite/template/seed" with { type: "json" };
import { createAppLsState, getLanguageService } from "../src/ls-host.ts";

const CLIENT_ENTRY = "/app/src/main.tsx";
const SERVER_ENTRY = "/app/src/hono/index.ts";

/** Mirrors ls-host's AMBIENT_ROOT_FILES, which it does not export. */
const AMBIENT_ROOTS: string[] = [
  "/types/cloudflare-ambient.d.ts",
  ...Object.keys(TYPES_VFS)
    .filter((k) => k.startsWith("/libs/lib.") && k.endsWith(".d.ts"))
    .sort(),
];

const files: Record<string, string> = {};
for (const [path, text] of Object.entries(
  seed.sourceFiles as Record<string, string>
)) {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) {
    files[`/app/${path}`] = text;
  }
}

function heapMb(): number {
  global.gc?.();
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed / 1_048_576;
}

/**
 * `roots` selects which /app files seed the program. Passing the entry alone
 * is what proves the split: everything else must arrive by import resolution,
 * exactly as it would in a real per-half check.
 */
function measure(label: string, roots: string[]) {
  const before = heapMb();
  const st = createAppLsState();
  // Overlay holds every app file so imports still resolve; only `roots` seed
  // the program, which is what makes the two halves' closures diverge.
  for (const [p, text] of Object.entries(files)) {
    st.overlay.set(p, text);
    st.versions.set(p, 1);
  }
  st.rootFiles = [...roots, ...AMBIENT_ROOTS];
  const ls = getLanguageService(st);

  // Semantic pass over the chosen roots only.
  const t0 = Date.now();
  let diagnostics = 0;
  for (const r of roots) {
    diagnostics += ls.getSemanticDiagnostics(r).length;
  }
  const ms = Date.now() - t0;

  const p = ls.getProgram();
  const sfs = p ? p.getSourceFiles() : [];
  const bytes = sfs.reduce((n, s) => n + s.text.length, 0);
  const after = heapMb();

  console.log(
    JSON.stringify({
      label,
      roots: roots.length,
      loadedFiles: sfs.length,
      loadedTextMb: Number((bytes / 1_048_576).toFixed(2)),
      diagnostics,
      ms,
      heapRetainedMb: Number((after - before).toFixed(0)),
    })
  );
  return after - before;
}

const appRoots = Object.keys(files).sort();
measure("union (today)", appRoots);
measure("client-only", [CLIENT_ENTRY]);
measure("server-only", [SERVER_ENTRY]);

// `client.ts` does `hc<ApiType>` against the server's Hono app type, so the
// client half infers the entire server route graph — drizzle, better-auth,
// zod. Stub that one import to price what breaking the client→server type
// link would buy, before proposing it as a change to the template's RPC design.
const CLIENT = "/app/src/lib/client.ts";
files[CLIENT] = `import { hc } from "hono/client";
import { publicBase } from "./public-base";
// biome-ignore lint/suspicious/noExplicitAny: measurement stub
export const client = hc<any>(publicBase ? \`\${publicBase}/api\` : "/api");
`;
measure("client-only, ApiType stubbed", [CLIENT_ENTRY]);
