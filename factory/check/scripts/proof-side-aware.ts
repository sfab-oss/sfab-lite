/**
 * Behavioural proof for check-time module resolution: side-aware client
 * gating, closed resolve (transitive-only + unknown), and planted-error
 * detection. Bundled by the companion .mjs runner so Node can load
 * workspace TS.
 */
import { moduleTypesForManifest } from "@sfab-lite/core/catalog-modules";
import { TEMPLATE_MANIFEST } from "@sfab-lite/starter-erp";
import seed from "@sfab-lite/starter-erp/seed" with { type: "json" };
import { type LsStore, runCheck } from "@sfab-lite/verbs/check";
import { SEED_MANIFEST } from "./seed-manifest.ts";

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
  files: Record<string, string>,
  extras?: {
    modules?: typeof SEED_MANIFEST.modules;
    moduleTypes?: Record<string, string>;
  }
): {
  clean: boolean;
  diagnostics: { code: number; message: string; file?: string }[];
  threw?: string;
} {
  try {
    const modules = extras?.modules ?? SEED_MANIFEST.modules;
    const result = runCheck(
      {
        appId: `side-proof-${label}`,
        files,
        manifest: { ...SEED_MANIFEST, modules },
        forceCold: true,
        ...(extras?.moduleTypes ? { moduleTypes: extras.moduleTypes } : {}),
      },
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

const dbSpecifier = `${clientDir
  .split("/")
  .map(() => "..")
  .join("/")}/db`;
const dbFiles = {
  ...baseFiles,
  [`${clientDir}/lib/bad-db.tsx`]: `import { createDb } from "${dbSpecifier}";\nexport const x = createDb;\n`,
};
const dbResult = check("3-client-relative-db", dbFiles);
const dbHit = dbResult.diagnostics.some(
  (d) =>
    d.message.includes(dbSpecifier) &&
    d.message.includes("client tree") &&
    (d.file?.includes("bad-db.tsx") ?? false)
);
if (dbResult.clean || !dbHit) {
  console.error(
    `FAIL: client importing ${dbSpecifier} must diagnose outside client tree`
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

// A sibling of the RFC client dirs (or of dirname(client.entry) on a nested
// tree) is not client-gated, so the same bare server import resolves.
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
    "FAIL: file outside the client tree must not get client-side gate",
    outsideResult.diagnostics
  );
  failed = true;
}

const slashyRel =
  clientDir === "src"
    ? "lib/slashy.tsx"
    : `${clientDir.slice("src/".length)}/lib/slashy.tsx`;
const slashFiles = {
  ...baseFiles,
  [`src//${slashyRel}`]: `import { drizzle } from "drizzle-orm/d1";\nexport const x = drizzle;\n`,
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
  [`${clientDir}/lib/../routes/dotdot.tsx`]: `import { drizzle } from "drizzle-orm/d1";\nexport const x = drizzle;\n`,
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

const serverSpecifier = `${clientDir
  .split("/")
  .map(() => "..")
  .join("/")}/server`;
const importTypeFiles = {
  ...baseFiles,
  [`${clientDir}/lib/type-cross.tsx`]: `import type { ApiType } from "${serverSpecifier}";\nexport type X = ApiType;\n`,
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

const txFiles = {
  ...baseFiles,
  "src/hono/routes/bad-transaction.ts": `export async function boom(db: { transaction: (fn: () => Promise<void>) => Promise<void> }) {
  await db.transaction(async () => undefined);
}
`,
};
const txResult = check("13-transaction-floor", txFiles);
const txHit = txResult.diagnostics.some(
  (d) =>
    d.message.includes("LITE-TX") &&
    d.message.includes("db.batch") &&
    d.message.includes("ADR-0014") &&
    (d.file?.includes("bad-transaction.ts") ?? false)
);
if (txResult.clean || !txHit) {
  console.error(
    "FAIL: .transaction( on app sources must fail with the LITE-TX floor diagnostic",
    txResult.diagnostics
  );
  failed = true;
}

const PDF_HELPER = `
import { PDFDocument, StandardFonts } from "pdf-lib";

export async function renderInvoicePdf(input: {
  number: string;
  partyName: string;
  lines: { description: string; amountCents: number }[];
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const { height } = page.getSize();
  page.drawText(\`Invoice \${input.number}\`, {
    x: 72,
    y: height - 72,
    size: 18,
    font,
  });
  page.drawText(input.partyName, { x: 72, y: height - 100, size: 12, font });
  return doc.save();
}
`;

const pdfModules = [{ name: "pdf-lib", version: "1.17.1" }] as const;
const pdfFiles = {
  ...baseFiles,
  "src/pdf/invoice.ts": PDF_HELPER,
};

const pdfResolve = check("14-pdf-lib-without-module", pdfFiles);
const pdfResolveHit = pdfResolve.diagnostics.some(
  (d) =>
    d.message.includes("LITE-RESOLVE") &&
    d.message.includes('"pdf-lib"') &&
    (d.file?.includes("pdf/invoice") ?? false)
);
if (pdfResolve.clean || !pdfResolveHit) {
  console.error(
    "FAIL: importing pdf-lib without a declared module must be LITE-RESOLVE",
    pdfResolve.diagnostics
  );
  failed = true;
}
const pdfResolveState = store.get("side-proof-14-pdf-lib-without-module");
if (
  [...(pdfResolveState?.overlay.keys() ?? [])].some((k) =>
    k.includes("pdf-lib")
  )
) {
  console.error("FAIL: pdf-lib overlay must not leak when modules is empty");
  failed = true;
}

const pdfOverlay = check("15-pdf-lib-stub-overlay", pdfFiles, {
  modules: [...pdfModules],
  moduleTypes: moduleTypesForManifest([...pdfModules]),
});
const helperDiags = pdfOverlay.diagnostics.filter((d) =>
  d.file?.includes("pdf/invoice")
);
if (helperDiags.length > 0) {
  console.error(
    "FAIL: declared pdf-lib + stub must typecheck the invoice helper",
    helperDiags
  );
  failed = true;
}

const pdfOutOfBoundFiles = {
  ...pdfFiles,
  "src/hono/org-protected/out-of-bound.ts": `import { PDFDocument } from "pdf-lib";\nexport const leak = PDFDocument;\n`,
};
const pdfOutOfBound = check("16-pdf-lib-out-of-boundary", pdfOutOfBoundFiles, {
  modules: [...pdfModules],
  moduleTypes: moduleTypesForManifest([...pdfModules]),
});
const pdfOutHit = pdfOutOfBound.diagnostics.some(
  (d) =>
    d.message.includes("LITE-RESOLVE") &&
    d.message.includes('"pdf-lib"') &&
    d.message.includes("src/pdf/") &&
    (d.file?.includes("out-of-bound") ?? false)
);
if (pdfOutOfBound.clean || !pdfOutHit) {
  console.error(
    "FAIL: importing pdf-lib outside src/pdf/ must be LITE-RESOLVE",
    pdfOutOfBound.diagnostics
  );
  failed = true;
}

const pdfLeakFiles = {
  ...pdfFiles,
  "src/pdf/invoice.ts": `${PDF_HELPER}\nexport type { PDFDocument } from "pdf-lib";\n`,
};
const pdfLeak = check("17-pdf-lib-reexport", pdfLeakFiles, {
  modules: [...pdfModules],
  moduleTypes: moduleTypesForManifest([...pdfModules]),
});
const pdfLeakHit = pdfLeak.diagnostics.some(
  (d) =>
    d.message.includes("LITE-BOUNDARY") &&
    d.message.includes("pdf-lib") &&
    (d.file?.includes("pdf/invoice") ?? false)
);
if (pdfLeak.clean || !pdfLeakHit) {
  console.error(
    "FAIL: re-exporting pdf-lib from a boundary file must be LITE-BOUNDARY",
    pdfLeak.diagnostics
  );
  failed = true;
}
const pdfOverlayState = store.get("side-proof-15-pdf-lib-stub-overlay");
if (
  [...(pdfOverlayState?.overlay.keys() ?? [])].some((k) =>
    k.startsWith("/node_modules/pdf-lib")
  )
) {
  console.error("FAIL: pdf-lib stub overlay must be stripped after runCheck");
  failed = true;
}

const pdfSurfaceFiles = {
  ...pdfFiles,
  "src/pdf/surface-miss.ts": `import { PDFDocument } from "pdf-lib";
export async function boom(doc: PDFDocument) {
  return doc.removePage(0);
}
`,
};
const pdfSurface = check("18-pdf-lib-surface-miss", pdfSurfaceFiles, {
  modules: [...pdfModules],
  moduleTypes: moduleTypesForManifest([...pdfModules]),
});
const pdfSurfaceHit = pdfSurface.diagnostics.some(
  (d) =>
    d.code === 2339 &&
    d.message.includes("LITE-SURFACE") &&
    d.message.includes("pdf-lib") &&
    d.message.includes("removePage") &&
    (d.file?.includes("pdf/surface-miss") ?? false)
);
if (pdfSurface.clean || !pdfSurfaceHit) {
  console.error(
    "FAIL: pdf-lib member missing from surface.d.ts must be LITE-SURFACE",
    pdfSurface.diagnostics
  );
  failed = true;
}
const pdfHelperStillClean = pdfSurface.diagnostics.filter((d) =>
  d.file?.includes("pdf/invoice")
);
if (pdfHelperStillClean.length > 0) {
  console.error(
    "FAIL: in-boundary helper that stays on the surface must still typecheck",
    pdfHelperStillClean
  );
  failed = true;
}

const honoSurfaceFiles = {
  ...baseFiles,
  "src/hono/org-protected/surface-miss.ts": `import { Hono } from "hono";
export const app = new Hono();
app.get("/surface-miss", (c) => c.text("nope"));
`,
};
const honoSurface = check("19-hono-surface-miss", honoSurfaceFiles);
const honoSurfaceHit = honoSurface.diagnostics.some(
  (d) =>
    d.code === 2339 &&
    d.message.includes("LITE-SURFACE") &&
    d.message.includes("hono") &&
    d.message.includes("text") &&
    (d.file?.includes("hono/org-protected/surface-miss") ?? false)
);
if (honoSurface.clean || !honoSurfaceHit) {
  console.error(
    "FAIL: Hono typed-overlay miss must be LITE-SURFACE, not a raw Hono bug",
    honoSurface.diagnostics
  );
  failed = true;
}

if (failed) {
  process.exit(1);
}
console.log("PASS: side-aware + closed-resolve behavioural proof");
