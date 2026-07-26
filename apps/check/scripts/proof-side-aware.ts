/**
 * Behavioural proof for side-aware client resolution (A2 / S3.4).
 *
 * Bundled by the companion .mjs runner so Node can load workspace TS.
 */
import { TEMPLATE_MANIFEST } from "@sfab-lite/template";
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

const clientEntry = TEMPLATE_MANIFEST.client.entry;
const clientDir = clientEntry.includes("/")
  ? clientEntry.slice(0, clientEntry.lastIndexOf("/"))
  : "";

const store: LsStore = new Map();

function check(
  label: string,
  files: Record<string, string>
): {
  ok: boolean;
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
          ok: result.ok,
          diagnosticCount: result.diagnosticCount,
          diagnostics: result.diagnostics,
        },
        null,
        2
      )
    );
    return result;
  } catch (err) {
    const threw = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({ label, threw }, null, 2));
    return { ok: false, diagnostics: [], threw };
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
if (!seedResult.ok) {
  console.error("FAIL: seeded template must typecheck clean");
  failed = true;
}

const drizzleFiles = {
  ...baseFiles,
  [`${clientDir}/lib/bad-drizzle.tsx`]: `import { drizzle } from "drizzle-orm/d1";\nexport const x = drizzle;\n`,
};
const drizzleResult = check("2-client-drizzle", drizzleFiles);
if (
  drizzleResult.ok ||
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

// Classification follows dirname(manifest.client.entry): a sibling tree is
// not client-gated, so the same bare server import resolves (union gate).
const outsideClientFiles = {
  ...baseFiles,
  "src/spa/not-client.tsx": `import { drizzle } from "drizzle-orm/d1";\nexport const x = drizzle;\n`,
};
const outsideResult = check("5-outside-client-tree", outsideClientFiles);
if (outsideResult.ok) {
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
  slashResult.ok ||
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
  dotdotResult.ok ||
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
if (sideEffectResult.ok || !sideEffectHit) {
  console.error(
    "FAIL: side-effect import of drizzle-orm/d1 must get guided server-only message",
    sideEffectResult.diagnostics
  );
  failed = true;
}

const importTypeFiles = {
  ...baseFiles,
  [`${clientDir}/lib/type-cross.tsx`]: `import type { AppType } from "../../hono";\nexport type X = AppType;\n`,
};
const importTypeResult = check("9-import-type-crosses", importTypeFiles);
if (!importTypeResult.ok) {
  console.error(
    "FAIL: import type across client/server boundary must stay clean",
    importTypeResult.diagnostics
  );
  failed = true;
}

if (failed) {
  process.exit(1);
}
console.log("PASS: side-aware resolution behavioural proof");
