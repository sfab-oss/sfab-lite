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

export function isKitSnapshot(value: unknown): value is KitSnapshot {
  if (value == null || typeof value !== "object") {
    return false;
  }
  const rec = value as Record<string, unknown>;
  return (
    rec.version === "6" &&
    rec.dialect === "sqlite" &&
    typeof rec.id === "string" &&
    typeof rec.prevId === "string" &&
    rec.tables != null &&
    typeof rec.tables === "object"
  );
}

export interface KitJournal {
  version: string;
  dialect: string;
  entries: Array<{
    idx: number;
    version: string;
    when: number;
    tag: string;
    breakpoints: boolean;
  }>;
}

export const EMPTY_JOURNAL: KitJournal = {
  version: "7",
  dialect: "sqlite",
  entries: [],
};

export function isKitJournal(value: unknown): value is KitJournal {
  if (value == null || typeof value !== "object") {
    return false;
  }
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.version === "string" &&
    rec.dialect === "sqlite" &&
    Array.isArray(rec.entries)
  );
}
