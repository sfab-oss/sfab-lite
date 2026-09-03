import { Hono } from "hono";
import { renderWorkbook, XLSX_CONTENT_TYPE } from "../../xlsx/export";
import type { AppEnv } from "../types";

export const xlsxExportRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const bytes = await renderWorkbook({
    sheetName: "Export",
    headers: ["Org", "Item", "Amount"],
    rows: [
      { values: [c.get("orgId"), "Professional services", 1200] },
      { values: [c.get("orgId"), "Support", 150] },
    ],
  });
  return new Response(bytes, {
    status: 200,
    headers: { "Content-Type": XLSX_CONTENT_TYPE },
  });
});
