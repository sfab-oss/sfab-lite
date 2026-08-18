import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { invitation, member, organization, session } from "./auth.ts";

/** A customer or vendor this organization trades with. */
export const party = sqliteTable(
  "party",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["customer", "vendor"] })
      .notNull()
      .default("customer"),
    name: text("name").notNull(),
    email: text("email"),
    taxId: text("tax_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("party_organizationId_idx").on(table.organizationId)]
);

/**
 * One credit-ledger line. Charges increase what the party owes; payments
 * decrease it. Amounts are always stored positive; the kind is the sign.
 */
export const ledgerEntry = sqliteTable(
  "ledger_entry",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    partyId: text("party_id")
      .notNull()
      .references(() => party.id, { onDelete: "restrict" }),
    kind: text("kind", { enum: ["charge", "payment"] }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    memo: text("memo"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("ledger_entry_organizationId_idx").on(table.organizationId),
    index("ledger_entry_partyId_idx").on(table.partyId),
  ]
);

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
  sessions: many(session),
  parties: many(party),
}));

export const partyRelations = relations(party, ({ one, many }) => ({
  organization: one(organization, {
    fields: [party.organizationId],
    references: [organization.id],
  }),
  entries: many(ledgerEntry),
}));

export const ledgerEntryRelations = relations(ledgerEntry, ({ one }) => ({
  organization: one(organization, {
    fields: [ledgerEntry.organizationId],
    references: [organization.id],
  }),
  party: one(party, {
    fields: [ledgerEntry.partyId],
    references: [party.id],
  }),
}));
