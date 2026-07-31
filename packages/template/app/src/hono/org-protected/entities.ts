import { and, asc, count, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  entityCreateSchema,
  entityUpdateSchema,
} from "../../contract/entities";
import { document, entity } from "../../db/schema";
import { createId } from "../../db/utils";
import type { AppEnv } from "../types";
import { jsonBody } from "../validate";

/** A row this organization is allowed to touch. */
const owned = (id: string, orgId: string) =>
  and(eq(entity.id, id), eq(entity.organizationId, orgId));

/**
 * The parties the organization trades with. Every query is scoped by the
 * organization from `requireOrg` and never by an id taken from the request.
 */
export const entityRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const orgId = c.get("orgId");
    const db = c.get("db");
    const page = 1;
    const pageSize = 100;

    const rows = await db
      .select()
      .from(entity)
      .where(eq(entity.organizationId, orgId))
      .orderBy(asc(entity.name))
      .limit(pageSize);

    const [totalRow] = await db
      .select({ total: count() })
      .from(entity)
      .where(eq(entity.organizationId, orgId));

    return c.json({
      data: rows,
      total: totalRow?.total ?? rows.length,
      page,
      pageSize,
    });
  })
  .post("/", jsonBody(entityCreateSchema), async (c) => {
    const input = c.req.valid("json");

    const [created] = await c
      .get("db")
      .insert(entity)
      .values({
        id: createId(),
        organizationId: c.get("orgId"),
        name: input.name,
        kind: input.kind,
        email: input.email ?? null,
        taxId: input.taxId ?? null,
      })
      .returning();

    return c.json({ entity: created }, 201);
  })
  .patch("/:id", jsonBody(entityUpdateSchema), async (c) => {
    const input = c.req.valid("json");

    const [updated] = await c
      .get("db")
      .update(entity)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.kind === undefined ? {} : { kind: input.kind }),
        ...(input.email === undefined ? {} : { email: input.email ?? null }),
        ...(input.taxId === undefined ? {} : { taxId: input.taxId ?? null }),
        updatedAt: new Date(),
      })
      .where(owned(c.req.param("id"), c.get("orgId")))
      .returning();

    if (!updated) {
      return c.json({ error: "not_found" as const }, 404);
    }
    return c.json({ entity: updated });
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");

    const [issued] = await c
      .get("db")
      .select({ id: document.id })
      .from(document)
      .where(
        and(
          eq(document.entityId, id),
          eq(document.organizationId, c.get("orgId"))
        )
      )
      .limit(1);

    if (issued) {
      return c.json({ error: "has_documents" as const }, 409);
    }

    const [deleted] = await c
      .get("db")
      .delete(entity)
      .where(owned(id, c.get("orgId")))
      .returning();

    if (!deleted) {
      return c.json({ error: "not_found" as const }, 404);
    }
    return c.json({ ok: true as const });
  });
