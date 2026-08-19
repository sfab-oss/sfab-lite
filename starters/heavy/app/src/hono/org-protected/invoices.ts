import { and, asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { z } from "zod";
import {
  invoiceCreateSchema,
  invoiceLineSchema,
  invoiceUpdateSchema,
} from "../../contract/invoices";
import { invoice, invoiceLine, item, party } from "../../db/schema";
import { createId } from "../../db/utils";
import type { AppEnv } from "../types";
import { jsonBody } from "../validate";

const ownedInvoice = (id: string, orgId: string) =>
  and(eq(invoice.id, id), eq(invoice.organizationId, orgId));

export const invoiceRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const orgId = c.get("orgId");
    const db = c.get("db");

    const rows = await db
      .select()
      .from(invoice)
      .where(eq(invoice.organizationId, orgId))
      .orderBy(desc(invoice.createdAt));

    const parties = await db
      .select({ id: party.id, name: party.name })
      .from(party)
      .where(eq(party.organizationId, orgId));
    const names = new Map(parties.map((row) => [row.id, row.name]));

    return c.json({
      data: rows.map((row) => ({
        ...row,
        partyName: names.get(row.partyId) ?? "Unknown",
      })),
    });
  })
  .post("/", jsonBody(invoiceCreateSchema), async (c) => {
    const input = c.req.valid("json");
    const orgId = c.get("orgId");
    const db = c.get("db");

    const [customer] = await db
      .select({ id: party.id, kind: party.kind })
      .from(party)
      .where(and(eq(party.id, input.partyId), eq(party.organizationId, orgId)))
      .limit(1);

    if (!customer) {
      return c.json({ error: "party_not_found" as const }, 404);
    }
    if (customer.kind !== "customer") {
      return c.json({ error: "party_not_customer" as const }, 400);
    }

    const [created] = await db
      .insert(invoice)
      .values({
        id: createId(),
        organizationId: orgId,
        partyId: input.partyId,
        status: "draft",
        memo: input.memo ?? null,
      })
      .returning();

    return c.json({ invoice: created }, 201);
  })
  .get("/:id", async (c) => {
    const orgId = c.get("orgId");
    const id = c.req.param("id");
    const db = c.get("db");

    const [row] = await db
      .select()
      .from(invoice)
      .where(ownedInvoice(id, orgId))
      .limit(1);

    if (!row) {
      return c.json({ error: "not_found" as const }, 404);
    }

    const [customer] = await db
      .select({ name: party.name })
      .from(party)
      .where(and(eq(party.id, row.partyId), eq(party.organizationId, orgId)))
      .limit(1);

    const lines = await db
      .select()
      .from(invoiceLine)
      .where(
        and(
          eq(invoiceLine.invoiceId, id),
          eq(invoiceLine.organizationId, orgId)
        )
      )
      .orderBy(asc(invoiceLine.id));

    const catalog = await db
      .select({ id: item.id, name: item.name })
      .from(item)
      .where(eq(item.organizationId, orgId));
    const itemNames = new Map(catalog.map((entry) => [entry.id, entry.name]));

    return c.json({
      invoice: {
        ...row,
        partyName: customer?.name ?? "Unknown",
      },
      lines: lines.map((line) => ({
        ...line,
        itemName: itemNames.get(line.itemId) ?? "Unknown",
      })),
    });
  })
  .patch("/:id", jsonBody(invoiceUpdateSchema), async (c) => {
    const input = c.req.valid("json");

    const patch: {
      status?: z.infer<typeof invoiceUpdateSchema>["status"];
      memo?: string | null;
    } = {};
    if (input.status !== undefined) {
      patch.status = input.status;
    }
    if (input.memo !== undefined) {
      patch.memo = input.memo ?? null;
    }

    const [updated] = await c
      .get("db")
      .update(invoice)
      .set(patch)
      .where(ownedInvoice(c.req.param("id"), c.get("orgId")))
      .returning();

    if (!updated) {
      return c.json({ error: "not_found" as const }, 404);
    }
    return c.json({ invoice: updated });
  })
  .delete("/:id", async (c) => {
    const [deleted] = await c
      .get("db")
      .delete(invoice)
      .where(ownedInvoice(c.req.param("id"), c.get("orgId")))
      .returning();

    if (!deleted) {
      return c.json({ error: "not_found" as const }, 404);
    }
    return c.json({ ok: true as const });
  })
  .post("/:id/lines", jsonBody(invoiceLineSchema), async (c) => {
    const input = c.req.valid("json");
    const orgId = c.get("orgId");
    const invoiceId = c.req.param("id");
    const db = c.get("db");

    const [header] = await db
      .select({ id: invoice.id })
      .from(invoice)
      .where(ownedInvoice(invoiceId, orgId))
      .limit(1);

    if (!header) {
      return c.json({ error: "not_found" as const }, 404);
    }

    const [catalog] = await db
      .select({
        id: item.id,
        unitPriceCents: item.unitPriceCents,
      })
      .from(item)
      .where(and(eq(item.id, input.itemId), eq(item.organizationId, orgId)))
      .limit(1);

    if (!catalog) {
      return c.json({ error: "item_not_found" as const }, 404);
    }

    const [created] = await db
      .insert(invoiceLine)
      .values({
        id: createId(),
        organizationId: orgId,
        invoiceId,
        itemId: catalog.id,
        quantity: input.quantity,
        unitPriceCents: catalog.unitPriceCents,
      })
      .returning();

    return c.json({ line: created }, 201);
  });
