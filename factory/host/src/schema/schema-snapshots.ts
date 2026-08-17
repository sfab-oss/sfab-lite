import type { ManifestV0 } from "@sfab-lite/core";
import {
  EMPTY_JOURNAL,
  isKitSnapshot,
  journalPath,
  type KitJournal,
} from "@sfab-lite/verbs/db";

const SQL_SUFFIX = /\.sql$/;
const SNAPSHOT_FILE = /^(\d{4})_snapshot\.json$/;

export const SCHEMA_META_LEGACY = "schema_meta_legacy" as const;

export const LEGACY_META_CD_MESSAGE =
  "migrations/meta is in the pre-2026-08-16 format — run `pnpm db:generate` once to convert it (writes drizzle-kit snapshot + journal, no SQL)";

function metaPrefix(manifest: ManifestV0): string {
  return `${manifest.migrations}/meta/`;
}

function snapshotName(path: string, prefix: string): string {
  return path.slice(prefix.length);
}

function sqlIds(files: Record<string, string>, manifest: ManifestV0): string[] {
  const prefix = `${manifest.migrations}/`;
  return Object.keys(files)
    .filter((path) => path.startsWith(prefix) && path.endsWith(".sql"))
    .sort()
    .map((path) => path.slice(prefix.length).replace(SQL_SUFFIX, ""));
}

function metaSnapshotPaths(
  files: Record<string, string>,
  manifest: ManifestV0
): string[] {
  const prefix = metaPrefix(manifest);
  return Object.keys(files).filter(
    (path) => path.startsWith(prefix) && path.endsWith("_snapshot.json")
  );
}

function isLegacySnapshotFile(
  path: string,
  raw: string,
  prefix: string
): boolean {
  if (!SNAPSHOT_FILE.test(snapshotName(path, prefix))) {
    return true;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return !isKitSnapshot(parsed);
  } catch {
    return true;
  }
}

export function isLegacySchemaMeta(
  files: Record<string, string>,
  manifest: ManifestV0
): boolean {
  const prefix = metaPrefix(manifest);
  if (
    sqlIds(files, manifest).length > 0 &&
    files[journalPath(manifest)] == null
  ) {
    return true;
  }
  for (const path of metaSnapshotPaths(files, manifest)) {
    const raw = files[path];
    if (raw != null && isLegacySnapshotFile(path, raw, prefix)) {
      return true;
    }
  }
  return false;
}

export function legacySchemaGateFailure(
  files: Record<string, string>,
  manifest: ManifestV0
): { error: typeof SCHEMA_META_LEGACY; message: string } | null {
  if (!isLegacySchemaMeta(files, manifest)) {
    return null;
  }
  return { error: SCHEMA_META_LEGACY, message: LEGACY_META_CD_MESSAGE };
}

export interface LegacyConversion {
  snapshotPath: string;
  journalPath: string;
  journal: KitJournal;
  deletePaths: string[];
  message: string;
}

export function convertLegacyMeta(
  files: Record<string, string>,
  manifest: ManifestV0,
  when: number
): LegacyConversion {
  const ids = sqlIds(files, manifest);
  const highest = ids.reduce((max, id) => {
    const n = Number.parseInt(id.slice(0, 4), 10);
    return Number.isNaN(n) ? max : Math.max(max, n);
  }, 0);
  const snapPath = `${metaPrefix(manifest)}${String(highest).padStart(4, "0")}_snapshot.json`;
  const jPath = journalPath(manifest);
  const prefix = metaPrefix(manifest);
  const deletePaths = metaSnapshotPaths(files, manifest).filter((path) => {
    const raw = files[path];
    return raw != null && isLegacySnapshotFile(path, raw, prefix);
  });
  const journal: KitJournal = {
    ...EMPTY_JOURNAL,
    entries: ids.map((tag) => {
      const idx = Number.parseInt(tag.slice(0, 4), 10);
      return {
        idx: Number.isNaN(idx) ? 0 : idx,
        version: "6",
        when,
        tag,
        breakpoints: true,
      };
    }),
  };
  const removed =
    deletePaths.length > 0 ? `; removed ${deletePaths.join(", ")}` : "";
  return {
    snapshotPath: snapPath,
    journalPath: jPath,
    journal,
    deletePaths,
    message: `db:generate: converted migrations/meta from the pre-2026-08-16 format (wrote ${snapPath}, ${jPath}${removed}; no SQL).\nBaseline taken from the current schema; verify against the applied ledger.\n`,
  };
}
