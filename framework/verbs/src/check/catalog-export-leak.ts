import type { CheckDiagnostic } from "@sfab-lite/core";
import { catalogEntry, parseCatalogPin } from "@sfab-lite/core/catalog-modules";

export const LITE_BOUNDARY_EXPORT_CODE = 9003;

const LEADING_SLASHES = /^\/+/;
const TS_EXT = /\.tsx?$/;
const REEXPORT =
  /export\s+(?:type\s+)?(?:\*|\{[\s\S]*?\})\s+from\s+["']([^"']+)["']/g;
const EXPORT_KW = /export\s/;

function overlayFile(rel: string): string {
  return `/app/${rel.replace(LEADING_SLASHES, "")}`;
}

function isScannedAppSource(rel: string): boolean {
  const path = rel.replace(LEADING_SLASHES, "");
  return (
    path.startsWith("src/") &&
    TS_EXT.test(path) &&
    !path.startsWith("src/generated/")
  );
}

function catalogSpec(specifier: string): string | undefined {
  const pinned = parseCatalogPin(specifier);
  if (pinned) {
    return catalogEntry(pinned.name, pinned.version)?.name;
  }
  return catalogEntry(specifier)?.name;
}

export function catalogExportLeakageDiagnostics(
  files: Record<string, string>
): CheckDiagnostic[] {
  const out: CheckDiagnostic[] = [];
  for (const [rel, text] of Object.entries(files)) {
    if (!isScannedAppSource(rel)) {
      continue;
    }
    const path = overlayFile(rel);
    const lines = text.split("\n");
    let searchFrom = 0;
    REEXPORT.lastIndex = 0;
    let match = REEXPORT.exec(text);
    while (match) {
      const spec = match[1];
      const pkg = spec == null ? undefined : catalogSpec(spec);
      if (pkg != null && match.index != null) {
        const before = text.slice(0, match.index);
        const line = before.split("\n").length;
        const lineText = lines[line - 1] ?? "";
        const column = lineText.search(EXPORT_KW);
        out.push({
          code: LITE_BOUNDARY_EXPORT_CODE,
          message: `LITE-BOUNDARY: ${rel.replace(LEADING_SLASHES, "")} re-exports "${pkg}". Boundary files must not leak catalog types; return app values (bytes, strings, numbers) instead.`,
          file: path,
          line,
          column: column === -1 ? 1 : column + 1,
        });
      }
      searchFrom = (match.index ?? 0) + (match[0]?.length ?? 1);
      REEXPORT.lastIndex = searchFrom;
      match = REEXPORT.exec(text);
    }
  }
  return out;
}
