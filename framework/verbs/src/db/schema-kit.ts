import { z } from "zod";

export const ORIGIN_SNAPSHOT_ID = "00000000-0000-0000-0000-000000000000";

export const KIT_SQL_BREAKPOINT = "--> statement-breakpoint";

const kitSnapshotSchema = z.object({
  version: z.literal("6"),
  dialect: z.literal("sqlite"),
  id: z.string(),
  prevId: z.string(),
  tables: z.record(z.string(), z.unknown()),
  views: z.record(z.string(), z.unknown()).optional(),
  enums: z.record(z.string(), z.unknown()).optional(),
  _meta: z.unknown().optional(),
  internal: z.unknown().optional(),
});

export type KitSnapshot = z.infer<typeof kitSnapshotSchema>;

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
  return kitSnapshotSchema.safeParse(value).success;
}

const kitJournalEntrySchema = z.object({
  idx: z.number(),
  version: z.string(),
  when: z.number(),
  tag: z.string(),
  breakpoints: z.boolean(),
});

const kitJournalSchema = z.object({
  version: z.string(),
  dialect: z.literal("sqlite"),
  entries: z.array(kitJournalEntrySchema),
});

export type KitJournal = z.infer<typeof kitJournalSchema>;

export const EMPTY_JOURNAL: KitJournal = {
  version: "7",
  dialect: "sqlite",
  entries: [],
};

export function isKitJournal(value: unknown): value is KitJournal {
  return kitJournalSchema.safeParse(value).success;
}
