/**
 * Kit on-disk `migrations/meta/`: version-6 snapshots + `_journal.json`.
 *
 * `db:generate` needs the last snapshot to diff against. Reading that from
 * the database costs a round trip; recording it beside the SQL is what
 * drizzle-kit's CLI does. The applied ledger (id + hash) is still ours.
 */
import type { ManifestV0 } from "@sfab-lite/core";
import {
  EMPTY_JOURNAL,
  EMPTY_SNAPSHOT,
  isKitJournal,
  isKitSnapshot,
  type KitJournal,
  type KitSnapshot,
} from "./schema-kit.ts";

const SNAPSHOT_FILE = /^(\d{4})_snapshot\.json$/;
const SQL_SUFFIX = /\.sql$/;
const JOURNAL_NAME = "_journal.json";

export const SCHEMA_META_LEGACY = "schema_meta_legacy" as const;

export const LEGACY_META_CD_MESSAGE =
  "migrations/meta is in the pre-2026-08-16 format — run `pnpm db:generate` once to convert it (writes drizzle-kit snapshot + journal, no SQL)";

function metaPrefix(manifest: ManifestV0): string {
  return `${manifest.migrations}/meta/`;
}

export function journalPath(manifest: ManifestV0): string {
  return `${metaPrefix(manifest)}${JOURNAL_NAME}`;
}

function snapshotIndex(migrationPath: string, manifest: ManifestV0): string {
  const id = migrationPath
    .slice(manifest.migrations.length + 1)
    .replace(SQL_SUFFIX, "");
  return id.slice(0, 4);
}

export function snapshotPathFor(
  migrationPath: string,
  manifest: ManifestV0
): string {
  return `${metaPrefix(manifest)}${snapshotIndex(migrationPath, manifest)}_snapshot.json`;
}

function parseJournal(
  files: Record<string, string>,
  manifest: ManifestV0
): KitJournal {
  const path = journalPath(manifest);
  const raw = files[path];
  if (raw == null) {
    return { ...EMPTY_JOURNAL, entries: [] };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isKitJournal(parsed)) {
      throw new Error("missing version, dialect, or entries");
    }
    return parsed;
  } catch (cause) {
    throw new Error(
      `${path} is not a drizzle-kit journal. db:generate cannot proceed without it.`,
      { cause }
    );
  }
}

function parseSnapshot(path: string, raw: string): KitSnapshot {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isKitSnapshot(parsed)) {
      throw new Error("not a version-6 sqlite snapshot");
    }
    return parsed;
  } catch (cause) {
    throw new Error(
      `${path} is not valid drizzle-kit snapshot JSON. It records the schema the migrations beside it produced, and db:generate cannot proceed without it.`,
      { cause }
    );
  }
}

export function latestSnapshot(
  files: Record<string, string>,
  manifest: ManifestV0
): KitSnapshot {
  const prefix = metaPrefix(manifest);
  const journal = parseJournal(files, manifest);
  const last = journal.entries.at(-1);
  if (last) {
    const named = `${prefix}${String(last.idx).padStart(4, "0")}_snapshot.json`;
    const raw = files[named];
    if (raw != null) {
      return parseSnapshot(named, raw);
    }
  }

  const paths = Object.keys(files)
    .filter((path) => {
      if (!(path.startsWith(prefix) && path.endsWith("_snapshot.json"))) {
        return false;
      }
      return SNAPSHOT_FILE.test(path.slice(prefix.length));
    })
    .sort();
  const newest = paths.at(-1);
  if (!newest) {
    return EMPTY_SNAPSHOT;
  }
  const raw = files[newest];
  if (!raw) {
    return EMPTY_SNAPSHOT;
  }
  return parseSnapshot(newest, raw);
}

export function serializeSnapshot(snapshot: KitSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export function serializeJournal(journal: KitJournal): string {
  return `${JSON.stringify(journal, null, 2)}\n`;
}

export function appendJournalEntry(
  files: Record<string, string>,
  manifest: ManifestV0,
  tag: string,
  when: number
): KitJournal {
  const journal = parseJournal(files, manifest);
  const idx = Number.parseInt(tag.slice(0, 4), 10);
  return {
    ...journal,
    entries: [
      ...journal.entries,
      {
        idx: Number.isNaN(idx) ? journal.entries.length : idx,
        version: "6",
        when,
        tag,
        breakpoints: true,
      },
    ],
  };
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
