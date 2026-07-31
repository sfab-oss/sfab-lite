import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import {
  documentCreateSchema,
  lineCreateSchema,
} from "../../contract/documents";
import type { Db } from "../../db";
import { document, documentLine, entity, product } from "../../db/schema";
import { createId } from "../../db/utils";
import type { AppEnv } from "../types";
import { jsonBody } from "../validate";

/** A row this organization is allowed to touch. */
const owned = (id: string, orgId: string) =>
  and(eq(document.id, id), eq(document.organizationId, orgId));

async function load(db: Db, id: string, orgId: string) {
  const [found] = await db
    .select()
    .from(document)
    .where(owned(id, orgId))
    .limit(1);
  return found;
}

function recomputeTotal(db: Db, id: string) {
  return db
    .update(document)
    .set({
      totalCents: sql`(SELECT COALESCE(SUM(${documentLine.quantity} * ${documentLine.unitPriceCents}), 0) FROM ${documentLine} WHERE ${documentLine.documentId} = ${id})`,
      updatedAt: new Date(),
    })
    .where(eq(document.id, id));
}

/**
 * Invoices, and the lines they are built from.
 *
 * A draft is working state and a finalized document is a record.
 */
export const documentRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const orgId = c.get("orgId");
    const db = c.get("db");
    const page = 1;
    const pageSize = 100;

    const rows = await db
      .select()
      .from(document)
      .where(eq(document.organizationId, orgId))
      .orderBy(desc(document.createdAt))
      .limit(pageSize);

    const [totalRow] = await db
      .select({ total: count() })
      .from(document)
      .where(eq(document.organizationId, orgId));

    return c.json({
      data: rows,
      total: totalRow?.total ?? rows.length,
      page,
      pageSize,
    });
  })
  .post("/", jsonBody(documentCreateSchema), async (c) => {
    const orgId = c.get("orgId");
    const db = c.get("db");

    const [counterparty] = await db
      .select()
      .from(entity)
      .where(
        and(
          eq(entity.id, c.req.valid("json").entityId),
          eq(entity.organizationId, orgId)
        )
      )
      .limit(1);

    if (!counterparty) {
      return c.json({ error: "entity_not_found" as const }, 404);
    }

    const [created] = await db
      .insert(document)
      .values({
        id: createId(),
        organizationId: orgId,
        entityId: counterparty.id,
        entityNameSnapshot: counterparty.name,
      })
      .returning();

    return c.json({ document: created }, 201);
  })
  .get("/:id", async (c) => {
    const db = c.get("db");
    const found = await load(db, c.req.param("id"), c.get("orgId"));

    if (!found) {
      return c.json({ error: "not_found" as const }, 404);
    }

    const lines = await db
      .select()
      .from(documentLine)
      .where(eq(documentLine.documentId, found.id))
      .orderBy(asc(documentLine.createdAt));

    return c.json({ document: found, lines });
  })
  .post("/:id/lines", jsonBody(lineCreateSchema), async (c) => {
    const orgId = c.get("orgId");
    const db = c.get("db");
    const input = c.req.valid("json");

    const found = await load(db, c.req.param("id"), orgId);
    if (!found) {
      return c.json({ error: "not_found" as const }, 404);
    }
    if (found.status !== "draft") {
      return c.json({ error: "not_a_draft" as const }, 409);
    }

    const [quoted] = input.productId
      ? await db
          .select()
          .from(product)
          .where(
            and(
              eq(product.id, input.productId),
              eq(product.organizationId, orgId)
            )
          )
          .limit(1)
      : [];

    if (input.productId && !quoted) {
      return c.json({ error: "product_not_found" as const }, 404);
    }

    const nameSnapshot = input.name ?? quoted?.name;
    const unitPriceCents = input.unitPriceCents ?? quoted?.unitPriceCents;

    if (nameSnapshot === undefined || unitPriceCents === undefined) {
      return c.json({ error: "line_incomplete" as const }, 400);
    }

    const [created] = await db
      .insert(documentLine)
      .values({
        id: createId(),
        documentId: found.id,
        productId: quoted?.id ?? null,
        nameSnapshot,
        quantity: input.quantity,
        unitPriceCents,
      })
      .returning();

    await recomputeTotal(db, found.id);

    return c.json({ line: created }, 201);
  })
  .delete("/:id/lines/:lineId", async (c) => {
    const db = c.get("db");

    const found = await load(db, c.req.param("id"), c.get("orgId"));
    if (!found) {
      return c.json({ error: "not_found" as const }, 404);
    }
    if (found.status !== "draft") {
      return c.json({ error: "not_a_draft" as const }, 409);
    }

    const [deleted] = await db
      .delete(documentLine)
      .where(
        and(
          eq(documentLine.id, c.req.param("lineId")),
          eq(documentLine.documentId, found.id)
        )
      )
      .returning();

    if (!deleted) {
      return c.json({ error: "not_found" as const }, 404);
    }

    await recomputeTotal(db, found.id);

    return c.json({ ok: true as const });
  })
  .post("/:id/finalize", async (c) => {
    const orgId = c.get("orgId");
    const db = c.get("db");
    const id = c.req.param("id");

    const found = await load(db, id, orgId);
    if (!found) {
      return c.json({ error: "not_found" as const }, 404);
    }

    const [anyLine] = await db
      .select({ id: documentLine.id })
      .from(documentLine)
      .where(eq(documentLine.documentId, found.id))
      .limit(1);

    if (!anyLine) {
      return c.json({ error: "no_lines" as const }, 409);
    }

    const [finalized] = await db
      .update(document)
      .set({
        status: "finalized",
        issuedAt: new Date(),
        number: sql`(SELECT COALESCE(MAX(${document.number}), 0) + 1 FROM ${document} WHERE ${document.organizationId} = ${orgId})`,
        totalCents: sql`(SELECT COALESCE(SUM(${documentLine.quantity} * ${documentLine.unitPriceCents}), 0) FROM ${documentLine} WHERE ${documentLine.documentId} = ${id})`,
        updatedAt: new Date(),
      })
      .where(and(owned(id, orgId), eq(document.status, "draft")))
      .returning();

    if (!finalized) {
      return c.json({ error: "not_a_draft" as const }, 409);
    }
    return c.json({ document: finalized });
  })
  .delete("/:id", async (c) => {
    const [deleted] = await c
      .get("db")
      .delete(document)
      .where(
        and(
          owned(c.req.param("id"), c.get("orgId")),
          eq(document.status, "draft")
        )
      )
      .returning();

    if (!deleted) {
      return c.json({ error: "not_a_draft" as const }, 409);
    }
    return c.json({ ok: true as const });
  });
