import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./auth.ts";
import { party } from "./ledger.ts";

export const item = sqliteTable(
  "item",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sku: text("sku"),
    unitPriceCents: integer("unit_price_cents").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("item_organizationId_idx").on(table.organizationId)]
);

export const invoice = sqliteTable(
  "invoice",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    partyId: text("party_id")
      .notNull()
      .references(() => party.id, { onDelete: "restrict" }),
    status: text("status", { enum: ["draft", "sent", "paid"] })
      .notNull()
      .default("draft"),
    memo: text("memo"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("invoice_organizationId_idx").on(table.organizationId),
    index("invoice_partyId_idx").on(table.partyId),
  ]
);

export const invoiceLine = sqliteTable(
  "invoice_line",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoice.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
  },
  (table) => [
    index("invoice_line_organizationId_idx").on(table.organizationId),
    index("invoice_line_invoiceId_idx").on(table.invoiceId),
    index("invoice_line_itemId_idx").on(table.itemId),
  ]
);

export const itemRelations = relations(item, ({ one, many }) => ({
  organization: one(organization, {
    fields: [item.organizationId],
    references: [organization.id],
  }),
  lines: many(invoiceLine),
}));

export const invoiceRelations = relations(invoice, ({ one, many }) => ({
  organization: one(organization, {
    fields: [invoice.organizationId],
    references: [organization.id],
  }),
  party: one(party, {
    fields: [invoice.partyId],
    references: [party.id],
  }),
  lines: many(invoiceLine),
}));

export const invoiceLineRelations = relations(invoiceLine, ({ one }) => ({
  organization: one(organization, {
    fields: [invoiceLine.organizationId],
    references: [organization.id],
  }),
  invoice: one(invoice, {
    fields: [invoiceLine.invoiceId],
    references: [invoice.id],
  }),
  item: one(item, {
    fields: [invoiceLine.itemId],
    references: [item.id],
  }),
}));
