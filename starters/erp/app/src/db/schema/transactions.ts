import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { invitation, member, organization, session } from "./auth.ts";
import { product } from "./catalog.ts";

/** A customer or supplier this organization trades with. */
export const entity = sqliteTable(
  "entity",
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
  (table) => [index("entity_organizationId_idx").on(table.organizationId)]
);

/**
 * An invoice: draft while it is being built, finalized once it is issued.
 *
 * `number` is null until finalize, and the unique index tolerates that —
 * SQLite treats nulls as distinct — so drafts cost nothing from the sequence
 * and a finalized document's number is unique within its organization.
 *
 * `entityNameSnapshot` is not redundant with the `entity` join. A document is
 * a record of what was issued, so renaming a customer must not rewrite the
 * invoices already sent to them.
 */
export const document = sqliteTable(
  "document",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    entityId: text("entity_id")
      .notNull()
      .references(() => entity.id, { onDelete: "restrict" }),
    entityNameSnapshot: text("entity_name_snapshot").notNull(),
    status: text("status", { enum: ["draft", "finalized"] })
      .notNull()
      .default("draft"),
    number: integer("number"),
    totalCents: integer("total_cents").notNull().default(0),
    issuedAt: integer("issued_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("document_organizationId_idx").on(table.organizationId),
    index("document_entityId_idx").on(table.entityId),
    uniqueIndex("document_organizationId_number_unique").on(
      table.organizationId,
      table.number
    ),
  ]
);

/**
 * One priced line of a document. `productId` may go null if the catalog entry
 * is deleted; `nameSnapshot` and `unitPriceCents` are what the line was issued
 * with, so the total stays reproducible from the line itself.
 */
export const documentLine = sqliteTable(
  "document_line",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => product.id, {
      onDelete: "set null",
    }),
    nameSnapshot: text("name_snapshot").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [index("document_line_documentId_idx").on(table.documentId)]
);

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
  sessions: many(session),
  entities: many(entity),
  products: many(product),
  documents: many(document),
}));

export const entityRelations = relations(entity, ({ one, many }) => ({
  organization: one(organization, {
    fields: [entity.organizationId],
    references: [organization.id],
  }),
  documents: many(document),
}));

export const productRelations = relations(product, ({ one, many }) => ({
  organization: one(organization, {
    fields: [product.organizationId],
    references: [organization.id],
  }),
  lines: many(documentLine),
}));

export const documentRelations = relations(document, ({ one, many }) => ({
  organization: one(organization, {
    fields: [document.organizationId],
    references: [organization.id],
  }),
  entity: one(entity, {
    fields: [document.entityId],
    references: [entity.id],
  }),
  lines: many(documentLine),
}));

export const documentLineRelations = relations(documentLine, ({ one }) => ({
  document: one(document, {
    fields: [documentLine.documentId],
    references: [document.id],
  }),
  product: one(product, {
    fields: [documentLine.productId],
    references: [product.id],
  }),
}));
