/**
 * Behavioural proof for side-aware client resolution (A2 / S3.4).
 *
 * Bundled by the companion .mjs runner so Node can load workspace TS.
 */
import seed from "../../factory/src/generated/seed.json" with { type: "json" };
import { type LsStore, runCheck } from "../src/run-check.ts";

const baseFiles: Record<string, string> = {};
for (const [path, text] of Object.entries(
  seed.sourceFiles as Record<string, string>
)) {
  if (path.endsWith(".ts") || path.endsWith(".tsx") || path.endsWith(".css")) {
    baseFiles[path] = text;
  }
}

const store: LsStore = new Map();

function check(
  label: string,
  files: Record<string, string>
): {
  ok: boolean;
  diagnostics: { code: number; message: string; file?: string }[];
} {
  const result = runCheck(
    { appId: `side-proof-${label}`, files, forceCold: true },
    { store }
  );
  console.log(
    JSON.stringify(
      {
        label,
        ok: result.ok,
        diagnosticCount: result.diagnosticCount,
        diagnostics: result.diagnostics,
      },
      null,
      2
    )
  );
  return result;
}

let failed = false;

const seedResult = check("1-seed-clean", baseFiles);
if (!seedResult.ok) {
  console.error("FAIL: seeded template must typecheck clean");
  failed = true;
}

const drizzleFiles = {
  ...baseFiles,
  "src/ui/lib/bad-drizzle.tsx": `import { drizzle } from "drizzle-orm/d1";\nexport const x = drizzle;\n`,
};
const drizzleResult = check("2-client-drizzle", drizzleFiles);
const drizzleHit = drizzleResult.diagnostics.some(
  (d) =>
    d.message.includes("drizzle-orm/d1") &&
    d.message.includes("server-only") &&
    (d.file?.includes("bad-drizzle.tsx") ?? false)
);
if (drizzleResult.ok || !drizzleHit) {
  console.error(
    "FAIL: client importing drizzle-orm/d1 must diagnose server-only"
  );
  failed = true;
}

const dbFiles = {
  ...baseFiles,
  "src/ui/lib/bad-db.tsx": `import { createDb } from "../../db";\nexport const x = createDb;\n`,
};
const dbResult = check("3-client-relative-db", dbFiles);
const dbHit = dbResult.diagnostics.some(
  (d) =>
    d.message.includes("../../db") &&
    d.message.includes("client tree") &&
    (d.file?.includes("bad-db.tsx") ?? false)
);
if (dbResult.ok || !dbHit) {
  console.error(
    "FAIL: client importing ../../db must diagnose outside client tree"
  );
  failed = true;
}

const serverFiles = {
  ...baseFiles,
  "src/hono/routes/ok-server.ts": `
import { drizzle } from "drizzle-orm/d1";
import { createDb } from "../../db";
export const _probe = { drizzle, createDb };
`,
};
const serverResult = check("4-server-still-ok", serverFiles);
if (!serverResult.ok) {
  console.error(
    "FAIL: server file importing drizzle-orm/d1 and ../../db must stay clean",
    serverResult.diagnostics
  );
  failed = true;
}

if (failed) {
  process.exit(1);
}
console.log("PASS: side-aware resolution behavioural proof");
