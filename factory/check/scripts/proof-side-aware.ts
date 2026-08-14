/**
 * Behavioural proof for check-time module resolution: side-aware client
 * gating, closed resolve (transitive-only + unknown), and planted-error
 * detection. Bundled by the companion .mjs runner so Node can load
 * workspace TS.
 */
import { TEMPLATE_MANIFEST } from "@sfab-lite/template";
import seed from "@sfab-lite/template/seed" with { type: "json" };
import { type LsStore, runCheck } from "../src/run-check.ts";

const baseFiles: Record<string, string> = {};
for (const [path, text] of Object.entries(
  seed.sourceFiles as Record<string, string>
)) {
  if (
    path.endsWith(".ts") ||
    path.endsWith(".tsx") ||
    path.endsWith(".css") ||
    path.endsWith(".hash")
  ) {
    baseFiles[path] = text;
  }
}

const clientEntry = TEMPLATE_MANIFEST.client.entry;
const clientDir = clientEntry.includes("/")
  ? clientEntry.slice(0, clientEntry.lastIndexOf("/"))
  : "";

const store: LsStore = new Map();

function check(
  label: string,
  files: Record<string, string>
): {
  clean: boolean;
  diagnostics: { code: number; message: string; file?: string }[];
  threw?: string;
} {
  try {
    const result = runCheck(
      { appId: `side-proof-${label}`, files, forceCold: true },
      { store }
    );
    console.log(
      JSON.stringify(
        {
          label,
          diagnosticCount: result.diagnosticCount,
          diagnostics: result.diagnostics,
        },
        null,
        2
      )
    );
    return { ...result, clean: result.diagnosticCount === 0 };
  } catch (err) {
    const threw = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({ label, threw }, null, 2));
    return { clean: false, diagnostics: [], threw };
  }
}

function hasServerOnlyDiag(
  result: { diagnostics: { message: string; file?: string }[] },
  moduleName: string,
  fileHint: string
): boolean {
  return result.diagnostics.some(
    (d) =>
      d.message.includes(moduleName) &&
      d.message.includes("server-only") &&
      (d.file?.includes(fileHint) ?? false)
  );
}

let failed = false;

console.log(
  JSON.stringify({
    label: "0-manifest-derived-tree",
    clientEntry,
    clientDir,
  })
);

const seedResult = check("1-seed-clean", baseFiles);
if (!seedResult.clean) {
  console.error("FAIL: seeded template must typecheck clean");
  failed = true;
}

const drizzleFiles = {
  ...baseFiles,
  [`${clientDir}/lib/bad-drizzle.tsx`]: `import { drizzle } from "drizzle-orm/d1";\nexport const x = drizzle;\n`,
};
const drizzleResult = check("2-client-drizzle", drizzleFiles);
if (
  drizzleResult.clean ||
  !hasServerOnlyDiag(drizzleResult, "drizzle-orm/d1", "bad-drizzle.tsx")
) {
  console.error(
    "FAIL: client importing drizzle-orm/d1 must diagnose server-only"
  );
  failed = true;
}

const dbFiles = {
  ...baseFiles,
  [`${clientDir}/lib/bad-db.tsx`]: `import { createDb } from "../../db";\nexport const x = createDb;\n`,
};
const dbResult = check("3-client-relative-db", dbFiles);
const dbHit = dbResult.diagnostics.some(
  (d) =>
    d.message.includes("../../db") &&
    d.message.includes("client tree") &&
    (d.file?.includes("bad-db.tsx") ?? false)
);
if (dbResult.clean || !dbHit) {
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
if (!serverResult.clean) {
  console.error(
    "FAIL: server file importing drizzle-orm/d1 and ../../db must stay clean",
    serverResult.diagnostics
  );
  failed = true;
}

// Classification follows dirname(manifest.client.entry): a sibling tree is
// not client-gated, so the same bare server import resolves (union gate).
const outsideClientFiles = {
  ...baseFiles,
  "src/spa/not-client.tsx": `import { drizzle } from "drizzle-orm/d1";\nexport const x = drizzle;\n`,
};
const outsideResult = check("5-outside-client-tree", outsideClientFiles);
if (outsideResult.clean) {
  console.log(
    JSON.stringify({
      label: "5-outside-client-tree-note",
      observed:
        "drizzle-orm/d1 resolves (server classification) — prefix tracks manifest",
    })
  );
} else {
  console.error(
    "FAIL: file outside dirname(client.entry) must not get client-side gate",
    outsideResult.diagnostics
  );
  failed = true;
}

const slashFiles = {
  ...baseFiles,
  "src//ui/lib/slashy.tsx": `import { drizzle } from "drizzle-orm/d1";\nexport const x = drizzle;\n`,
};
const slashResult = check("6-double-slash-key", slashFiles);
if (
  slashResult.threw ||
  slashResult.clean ||
  !hasServerOnlyDiag(slashResult, "drizzle-orm/d1", "slashy.tsx")
) {
  console.error(
    "FAIL: // key must normalize into client tree and reject server-only import",
    slashResult
  );
  failed = true;
}

const dotdotFiles = {
  ...baseFiles,
  "src/ui/lib/../routes/dotdot.tsx": `import { drizzle } from "drizzle-orm/d1";\nexport const x = drizzle;\n`,
};
const dotdotResult = check("7-dotdot-key", dotdotFiles);
if (
  dotdotResult.threw ||
  dotdotResult.clean ||
  !hasServerOnlyDiag(dotdotResult, "drizzle-orm/d1", "dotdot.tsx")
) {
  console.error(
    "FAIL: .. key that lands in client tree must reject server-only import",
    dotdotResult
  );
  failed = true;
}

const sideEffectFiles = {
  ...baseFiles,
  [`${clientDir}/lib/bad-side-effect.tsx`]: `import "drizzle-orm/d1";\nexport const x = 1;\n`,
};
const sideEffectResult = check("8-side-effect-import", sideEffectFiles);
const sideEffectHit = sideEffectResult.diagnostics.some(
  (d) =>
    d.code === 2882 &&
    d.message.includes("drizzle-orm/d1") &&
    d.message.includes("server-only") &&
    (d.file?.includes("bad-side-effect.tsx") ?? false)
);
if (sideEffectResult.clean || !sideEffectHit) {
  console.error(
    "FAIL: side-effect import of drizzle-orm/d1 must get guided server-only message",
    sideEffectResult.diagnostics
  );
  failed = true;
}

const importTypeFiles = {
  ...baseFiles,
  [`${clientDir}/lib/type-cross.tsx`]: `import type { ApiType } from "../../hono";\nexport type X = ApiType;\n`,
};
const importTypeResult = check("9-import-type-crosses", importTypeFiles);
if (!importTypeResult.clean) {
  console.error(
    "FAIL: import type across client/server boundary must stay clean",
    importTypeResult.diagnostics
  );
  failed = true;
}

const kyselyFiles = {
  ...baseFiles,
  "src/hono/routes/bad-kysely.ts": `import { Kysely } from "kysely";\nexport const x = Kysely;\n`,
};
const kyselyResult = check("10-kysely-closed-resolve", kyselyFiles);
const kyselyHit = kyselyResult.diagnostics.some(
  (d) =>
    d.message.includes("LITE-RESOLVE") &&
    d.message.includes('"kysely"') &&
    d.message.includes("transitive-only") &&
    d.message.includes("not served to apps") &&
    (d.file?.includes("bad-kysely.ts") ?? false)
);
if (kyselyResult.clean || !kyselyHit) {
  console.error(
    "FAIL: importing kysely must fail with the LITE-RESOLVE transitive-only diagnostic",
    kyselyResult.diagnostics
  );
  failed = true;
}

const dateFnsFiles = {
  ...baseFiles,
  "src/hono/routes/bad-date-fns.ts": `import { format } from "date-fns";\nexport const x = format;\n`,
};
const dateFnsResult = check("11-unknown-closed-resolve", dateFnsFiles);
const dateFnsHit = dateFnsResult.diagnostics.some(
  (d) =>
    d.message.includes("LITE-RESOLVE") &&
    d.message.includes('"date-fns"') &&
    d.message.includes("not part of the app surface") &&
    (d.file?.includes("bad-date-fns.ts") ?? false)
);
if (dateFnsResult.clean || !dateFnsHit) {
  console.error(
    "FAIL: importing date-fns must fail with the LITE-RESOLVE unknown-module diagnostic",
    dateFnsResult.diagnostics
  );
  failed = true;
}

const plantedFiles = {
  ...baseFiles,
  "src/hono/routes/planted-type-error.ts": `export const n: number = "nope";\n`,
};
const plantedResult = check("12-planted-type-error", plantedFiles);
const plantedHit = plantedResult.diagnostics.some(
  (d) =>
    d.code === 2322 &&
    d.message.includes("not assignable") &&
    (d.file?.includes("planted-type-error.ts") ?? false)
);
if (plantedResult.clean || !plantedHit) {
  console.error(
    "FAIL: planted type error must still be reported as TS2322",
    plantedResult.diagnostics
  );
  failed = true;
}

if (failed) {
  process.exit(1);
}
console.log("PASS: side-aware + closed-resolve behavioural proof");
