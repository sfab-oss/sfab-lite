import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { itemCreateSchema, itemUpdateSchema } from "../../contract/items";
import { invoiceLine, item } from "../../db/schema";
import { createId } from "../../db/utils";
import type { AppEnv } from "../types";
import { jsonBody } from "../validate";

const owned = (id: string, orgId: string) =>
  and(eq(item.id, id), eq(item.organizationId, orgId));

export const itemRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const orgId = c.get("orgId");
    const rows = await c
      .get("db")
      .select()
      .from(item)
      .where(eq(item.organizationId, orgId))
      .orderBy(asc(item.name));

    return c.json({ data: rows });
  })
  .post("/", jsonBody(itemCreateSchema), async (c) => {
    const input = c.req.valid("json");

    const [created] = await c
      .get("db")
      .insert(item)
      .values({
        id: createId(),
        organizationId: c.get("orgId"),
        name: input.name,
        sku: input.sku ?? null,
        unitPriceCents: input.unitPriceCents,
      })
      .returning();

    return c.json({ item: created }, 201);
  })
  .get("/:id", async (c) => {
    const [row] = await c
      .get("db")
      .select()
      .from(item)
      .where(owned(c.req.param("id"), c.get("orgId")))
      .limit(1);

    if (!row) {
      return c.json({ error: "not_found" as const }, 404);
    }
    return c.json({ item: row });
  })
  .patch("/:id", jsonBody(itemUpdateSchema), async (c) => {
    const input = c.req.valid("json");

    const patch: {
      name?: string;
      sku?: string | null;
      unitPriceCents?: number;
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if (input.name !== undefined) {
      patch.name = input.name;
    }
    if (input.sku !== undefined) {
      patch.sku = input.sku ?? null;
    }
    if (input.unitPriceCents !== undefined) {
      patch.unitPriceCents = input.unitPriceCents;
    }

    const [updated] = await c
      .get("db")
      .update(item)
      .set(patch)
      .where(owned(c.req.param("id"), c.get("orgId")))
      .returning();

    if (!updated) {
      return c.json({ error: "not_found" as const }, 404);
    }
    return c.json({ item: updated });
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const orgId = c.get("orgId");
    const db = c.get("db");

    const [existing] = await db
      .select({ id: invoiceLine.id })
      .from(invoiceLine)
      .where(
        and(eq(invoiceLine.itemId, id), eq(invoiceLine.organizationId, orgId))
      )
      .limit(1);

    if (existing) {
      return c.json({ error: "has_lines" as const }, 409);
    }

    const [deleted] = await db.delete(item).where(owned(id, orgId)).returning();

    if (!deleted) {
      return c.json({ error: "not_found" as const }, 404);
    }
    return c.json({ ok: true as const });
  });
