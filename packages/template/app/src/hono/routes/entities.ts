import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { document, entity } from "../../db/schema";
import type { AppEnv } from "../middleware";
import { requireOrg } from "../middleware";
import { jsonBody } from "../validate";

const kindSchema = z.enum(["customer", "vendor"]);

const entityCreateSchema = z.object({
  name: z.string().min(1).max(200),
  kind: kindSchema.default("customer"),
  email: z.email().max(200).nullish(),
  taxId: z.string().max(50).nullish(),
});

const entityUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  kind: kindSchema.optional(),
  email: z.email().max(200).nullish(),
  taxId: z.string().max(50).nullish(),
});

/** A row this organization is allowed to touch. */
const owned = (id: string, orgId: string) =>
  and(eq(entity.id, id), eq(entity.organizationId, orgId));

/**
 * The parties the organization trades with. Every query is scoped by the
 * organization from `requireOrg` and never by an id taken from the request,
 * which is what keeps one tenant out of another's rows — copy that scoping
 * into whatever resource you add next.
 */
export const entityRoutes = new Hono<AppEnv>()
  .use("*", requireOrg)
  .get("/", async (c) => {
    const rows = await c
      .get("db")
      .select()
      .from(entity)
      .where(eq(entity.organizationId, c.get("orgId")))
      .orderBy(asc(entity.name));

    return c.json({ entities: rows });
  })
  .post("/", jsonBody(entityCreateSchema), async (c) => {
    const input = c.req.valid("json");

    const [created] = await c
      .get("db")
      .insert(entity)
      .values({
        id: crypto.randomUUID(),
        organizationId: c.get("orgId"),
        name: input.name,
        kind: input.kind,
        email: input.email ?? null,
        taxId: input.taxId ?? null,
      })
      .returning();

    return c.json({ entity: created }, 201);
  })
  // Writes match on id AND organization in a single statement rather than
  // reading the row first: an empty `returning()` is the 404, and there is no
  // window between checking ownership and acting on it.
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
  // `document.entity_id` is ON DELETE RESTRICT, so the database would refuse
  // this anyway — as a raw constraint failure. Asking first turns that into an
  // answer the UI can show.
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
