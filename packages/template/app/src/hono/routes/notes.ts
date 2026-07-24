import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { note } from "../../db/schema";
import type { AppEnv } from "../middleware";
import { requireOrg } from "../middleware";
import { jsonBody } from "../validate";

const noteCreateSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(10_000).default(""),
});

const noteUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(10_000).optional(),
});

/** A row this organization is allowed to touch. */
const owned = (id: string, orgId: string) =>
  and(eq(note.id, id), eq(note.organizationId, orgId));

/**
 * The demo entity — a per-organization CRUD resource. This is the part of
 * the seed you are meant to replace: swap the table, keep the shape.
 *
 * Every query is scoped by the organization from `requireOrg` and never by
 * an id taken from the request, which is what keeps one tenant out of
 * another's rows.
 */
export const noteRoutes = new Hono<AppEnv>()
  .use("*", requireOrg)
  .get("/", async (c) => {
    const rows = await c
      .get("db")
      .select()
      .from(note)
      .where(eq(note.organizationId, c.get("orgId")))
      .orderBy(desc(note.createdAt));

    return c.json({ notes: rows });
  })
  .post("/", jsonBody(noteCreateSchema), async (c) => {
    const input = c.req.valid("json");

    const [created] = await c
      .get("db")
      .insert(note)
      .values({
        id: crypto.randomUUID(),
        organizationId: c.get("orgId"),
        title: input.title,
        body: input.body,
      })
      .returning();

    return c.json({ note: created }, 201);
  })
  // Writes match on id AND organization in a single statement rather than
  // reading the row first: an empty `returning()` is the 404, and there is no
  // window between checking ownership and acting on it.
  .patch("/:id", jsonBody(noteUpdateSchema), async (c) => {
    const input = c.req.valid("json");

    const [updated] = await c
      .get("db")
      .update(note)
      .set({
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.body === undefined ? {} : { body: input.body }),
        updatedAt: new Date(),
      })
      .where(owned(c.req.param("id"), c.get("orgId")))
      .returning();

    if (!updated) {
      return c.json({ error: "not_found" as const }, 404);
    }
    return c.json({ note: updated });
  })
  .delete("/:id", async (c) => {
    const [deleted] = await c
      .get("db")
      .delete(note)
      .where(owned(c.req.param("id"), c.get("orgId")))
      .returning();

    if (!deleted) {
      return c.json({ error: "not_found" as const }, 404);
    }
    return c.json({ ok: true as const });
  });
