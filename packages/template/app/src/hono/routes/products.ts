import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { product } from "../../db/schema";
import type { AppEnv } from "../middleware";
import { requireOrg } from "../middleware";
import { jsonBody } from "../validate";

const productCreateSchema = z.object({
  sku: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  unitPriceCents: z.int().min(0).max(1_000_000_000).default(0),
});

const productUpdateSchema = z.object({
  sku: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  unitPriceCents: z.int().min(0).max(1_000_000_000).optional(),
});

/** A row this organization is allowed to touch. */
const owned = (id: string, orgId: string) =>
  and(eq(product.id, id), eq(product.organizationId, orgId));

/**
 * The catalog. Prices are integer minor units end to end — no float ever
 * touches money here, so a total is exact rather than nearly right.
 *
 * `sku` is unique per organization, which is a database constraint rather than
 * a check in this file: two concurrent requests cannot both pass a check, and
 * only one can win a unique index.
 */
export const productRoutes = new Hono<AppEnv>()
  .use("*", requireOrg)
  .get("/", async (c) => {
    const rows = await c
      .get("db")
      .select()
      .from(product)
      .where(eq(product.organizationId, c.get("orgId")))
      .orderBy(asc(product.sku));

    return c.json({ products: rows });
  })
  .post("/", jsonBody(productCreateSchema), async (c) => {
    const input = c.req.valid("json");

    const [created] = await c
      .get("db")
      .insert(product)
      .values({
        id: crypto.randomUUID(),
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
  // Lines carry their own name and price, so a deleted product leaves the
  // documents it was billed on intact — `document_line.product_id` goes null
  // and nothing about the issued total moves.
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
