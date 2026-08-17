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
