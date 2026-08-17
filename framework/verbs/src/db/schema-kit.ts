export const ORIGIN_SNAPSHOT_ID = "00000000-0000-0000-0000-000000000000";

export const KIT_SQL_BREAKPOINT = "--> statement-breakpoint";

export interface KitSnapshot {
  version: string;
  dialect: string;
  id: string;
  prevId: string;
  tables: Record<string, unknown>;
  views?: Record<string, unknown>;
  enums?: Record<string, unknown>;
  _meta?: unknown;
  internal?: unknown;
}

export const EMPTY_SNAPSHOT: KitSnapshot = {
  version: "6",
  dialect: "sqlite",
  tables: {},
  views: {},
  enums: {},
  _meta: { tables: {}, columns: {} },
  internal: { indexes: {} },
  id: ORIGIN_SNAPSHOT_ID,
  prevId: ORIGIN_SNAPSHOT_ID,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isKitSnapshot(value: unknown): value is KitSnapshot {
  if (!isPlainObject(value)) {
    return false;
  }
  return (
    value.version === "6" &&
    value.dialect === "sqlite" &&
    typeof value.id === "string" &&
    typeof value.prevId === "string" &&
    isPlainObject(value.tables)
  );
}

interface KitJournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

export interface KitJournal {
  version: string;
  dialect: string;
  entries: KitJournalEntry[];
}

export const EMPTY_JOURNAL: KitJournal = {
  version: "7",
  dialect: "sqlite",
  entries: [],
};

function isKitJournalEntry(value: unknown): value is KitJournalEntry {
  if (!isPlainObject(value)) {
    return false;
  }
  return (
    typeof value.idx === "number" &&
    typeof value.version === "string" &&
    typeof value.when === "number" &&
    typeof value.tag === "string" &&
    typeof value.breakpoints === "boolean"
  );
}

export function isKitJournal(value: unknown): value is KitJournal {
  if (!isPlainObject(value)) {
    return false;
  }
  return (
    typeof value.version === "string" &&
    value.dialect === "sqlite" &&
    Array.isArray(value.entries) &&
    value.entries.every(isKitJournalEntry)
  );
}
