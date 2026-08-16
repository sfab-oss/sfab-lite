import type { CheckDiagnostic } from "@sfab-lite/core";

export const LITE_TX_CODE = 9002;

export const LITE_TX_MESSAGE =
  "LITE-TX: interactive transactions are not available on every engine (D1); use `db.batch` — ADR-0014";

const TX_CALL = /\.transaction\s*\(/;
const LEADING_SLASHES = /^\/+/;
const TS_EXT = /\.tsx?$/;

function overlayFile(rel: string): string {
  return `/app/${rel.replace(LEADING_SLASHES, "")}`;
}

function isScannedAppSource(rel: string): boolean {
  const path = rel.replace(LEADING_SLASHES, "");
  if (!(path.startsWith("src/") && TS_EXT.test(path))) {
    return false;
  }
  if (path.startsWith("src/generated/")) {
    return false;
  }
  if (path === "src/db/index.ts") {
    return false;
  }
  return true;
}

export function transactionFloorDiagnostics(
  files: Record<string, string>
): CheckDiagnostic[] {
  const out: CheckDiagnostic[] = [];
  for (const [rel, text] of Object.entries(files)) {
    if (!isScannedAppSource(rel)) {
      continue;
    }
    const path = overlayFile(rel);
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line == null) {
        continue;
      }
      const column = line.search(TX_CALL);
      if (column === -1) {
        continue;
      }
      out.push({
        code: LITE_TX_CODE,
        message: LITE_TX_MESSAGE,
        file: path,
        line: i + 1,
        column: column + 1,
      });
    }
  }
  return out;
}
