import assert from "node:assert/strict";
import { test } from "node:test";
import {
  diagnosticRelatedPaths,
  rewriteSurfaceDiagnostic,
  type SurfaceRewriteInput,
} from "./surface-diagnostic.ts";

const PDF_STUB = `export class PDFDocument {
  static create(): Promise<PDFDocument>;
  addPage(size?: [number, number]): unknown;
  save(): Promise<Uint8Array>;
}
`;

const PDF_KEY = "/node_modules/pdf-lib/index.d.ts";
const overlay = new Map([[PDF_KEY, PDF_STUB]]);
const catalogOverlayKeys = new Set([PDF_KEY]);

function input(
  partial: Partial<SurfaceRewriteInput> &
    Pick<SurfaceRewriteInput, "code" | "message">
): SurfaceRewriteInput {
  return {
    usageFile: "/app/src/pdf/invoice.ts",
    relatedPaths: [],
    catalogOverlayKeys,
    overlay,
    isClientUsage: false,
    ...partial,
  };
}

test("rewrites a catalog property miss from the overlay related path", () => {
  const message = rewriteSurfaceDiagnostic(
    input({
      code: 2339,
      message: "Property 'removePage' does not exist on type 'PDFDocument'.",
      relatedPaths: [PDF_KEY],
    })
  );
  assert.ok(message?.includes("LITE-SURFACE"));
  assert.ok(
    message?.includes(
      "pdf-lib's checked surface does not declare PDFDocument.removePage"
    )
  );
  assert.ok(message?.includes("the app cannot add it"));
  assert.ok(message?.includes("Property 'removePage' does not exist"));
});

test("falls back to the catalog stub text when related paths are empty", () => {
  const message = rewriteSurfaceDiagnostic(
    input({
      code: 2339,
      message: "Property 'removePage' does not exist on type 'PDFDocument'.",
    })
  );
  assert.ok(
    message?.includes(
      "pdf-lib's checked surface does not declare PDFDocument.removePage"
    )
  );
});

test("rewrites a Hono overlay miss from a related hono path", () => {
  const message = rewriteSurfaceDiagnostic(
    input({
      code: 2339,
      message:
        "Property 'text' does not exist on type 'Context<EnvBase, unknown>'.",
      usageFile: "/app/src/hono/org-protected/surface-miss.ts",
      relatedPaths: ["/node_modules/hono/dist/types/index.d.ts"],
      catalogOverlayKeys: new Set(),
      overlay: new Map(),
    })
  );
  assert.ok(
    message?.includes(
      "LITE-SURFACE: hono's checked surface does not declare Context.text"
    )
  );
});

test("does not rewrite a Hono miss on a client file", () => {
  const message = rewriteSurfaceDiagnostic(
    input({
      code: 2339,
      message: "Property 'text' does not exist on type 'Context'.",
      usageFile: "/app/src/lib/client.ts",
      relatedPaths: ["/node_modules/hono/dist/types/index.d.ts"],
      isClientUsage: true,
      catalogOverlayKeys: new Set(),
      overlay: new Map(),
    })
  );
  assert.equal(message, undefined);
});

test("does not rewrite an app-local property miss", () => {
  const message = rewriteSurfaceDiagnostic(
    input({
      code: 2339,
      message: "Property 'nope' does not exist on type 'LocalThing'.",
    })
  );
  assert.equal(message, undefined);
});

test("keeps non-surface codes untouched", () => {
  const message = rewriteSurfaceDiagnostic(
    input({
      code: 2322,
      message: "Type 'string' is not assignable to type 'number'.",
      relatedPaths: [PDF_KEY],
    })
  );
  assert.equal(message, undefined);
});

test("rewrites a curated-signature reject as does not accept", () => {
  const message = rewriteSurfaceDiagnostic(
    input({
      code: 2345,
      message:
        "Argument of type 'number' is not assignable to parameter of type 'string'.",
      relatedPaths: [PDF_KEY],
    })
  );
  assert.ok(
    message?.includes("pdf-lib's checked surface does not accept this call")
  );
});

test("collects relatedInformation file names", () => {
  assert.deepEqual(
    diagnosticRelatedPaths({
      relatedInformation: [
        { file: { fileName: PDF_KEY } },
        { file: undefined },
      ],
    }),
    [PDF_KEY]
  );
});
