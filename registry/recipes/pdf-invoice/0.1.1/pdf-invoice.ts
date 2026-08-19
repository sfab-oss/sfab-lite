import { Hono } from "hono";
import { PDF_CONTENT_TYPE, renderInvoicePdf } from "../../pdf/invoice";
import type { AppEnv } from "../types";

export const pdfInvoiceRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const bytes = await renderInvoicePdf({
    number: "INV-0001",
    partyName: c.get("orgId"),
    lines: [
      { description: "Professional services", amountCents: 120_000 },
      { description: "Support", amountCents: 15_000 },
    ],
  });
  return new Response(bytes, {
    status: 200,
    headers: { "Content-Type": PDF_CONTENT_TYPE },
  });
});
