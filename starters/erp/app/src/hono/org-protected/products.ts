import { and, asc, count, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  productCreateSchema,
  productUpdateSchema,
} from "../../contract/products";
import { product } from "../../db/schema";
import { createId } from "../../db/utils";
import type { AppEnv } from "../types";
import { jsonBody } from "../validate";

/** A row this organization is allowed to touch. */
const owned = (id: string, orgId: string) =>
  and(eq(product.id, id), eq(product.organizationId, orgId));

/**
 * The catalog. Prices are integer minor units end to end — no float ever
 * touches money here.
 */
export const productRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const orgId = c.get("orgId");
    const db = c.get("db");
    const page = 1;
    const pageSize = 100;

    const rows = await db
      .select()
      .from(product)
      .where(eq(product.organizationId, orgId))
      .orderBy(asc(product.sku))
      .limit(pageSize);

    const [totalRow] = await db
      .select({ total: count() })
      .from(product)
      .where(eq(product.organizationId, orgId));

    return c.json({
      data: rows,
      total: totalRow?.total ?? rows.length,
      page,
      pageSize,
    });
  })
  .post("/", jsonBody(productCreateSchema), async (c) => {
    const input = c.req.valid("json");

    const [created] = await c
      .get("db")
      .insert(product)
      .values({
        id: createId(),
        organizationId: c.get("orgId"),
        sku: input.sku,
        name: input.name,
        unitPriceCents: input.unitPriceCents,
      })
      .onConflictDoNothing()
      .returning();

    if (!created) {
      return c.json({ error: "sku_taken" as const }, 409);
    }
    return c.json({ product: created }, 201);
  })
  .patch("/:id", jsonBody(productUpdateSchema), async (c) => {
    const input = c.req.valid("json");

    const [updated] = await c
      .get("db")
      .update(product)
      .set({
        ...(input.sku === undefined ? {} : { sku: input.sku }),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.unitPriceCents === undefined
          ? {}
          : { unitPriceCents: input.unitPriceCents }),
        updatedAt: new Date(),
      })
      .where(owned(c.req.param("id"), c.get("orgId")))
      .returning();

    if (!updated) {
      return c.json({ error: "not_found" as const }, 404);
    }
    return c.json({ product: updated });
  })
  .delete("/:id", async (c) => {
    const [deleted] = await c
      .get("db")
      .delete(product)
      .where(owned(c.req.param("id"), c.get("orgId")))
      .returning();

    if (!deleted) {
      return c.json({ error: "not_found" as const }, 404);
    }
    return c.json({ ok: true as const });
  });
