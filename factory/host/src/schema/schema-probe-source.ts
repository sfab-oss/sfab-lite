/**
 * The source of the probe worker — runs inside an app's own bundle so it can
 * pass the schema's table objects to drizzle-kit's generate API.
 *
 * Split from `schema-probe.ts` so the drizzle-kit call shape is a pure
 * function of a path and can be inspected in tests. The Worker Loader
 * transport around it is already proven by the server bundle.
 */
export function probeEntrySource(schemaEntry: string): string {
  const relative = `./${schemaEntry.slice("src/".length)}`;
  return `
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "./api.mjs";
import * as schema from ${JSON.stringify(relative)};

export default {
  async fetch(request) {
    try {
      const body = await request.json().catch(() => ({}));
      const prev = body.prev;
      const snapshot = await generateSQLiteDrizzleJson(
        schema,
        prev && typeof prev.id === "string" ? prev.id : undefined
      );
      const sql = await generateSQLiteMigration(
        prev ?? (await generateSQLiteDrizzleJson({})),
        snapshot
      );
      return Response.json({ ok: true, snapshot, sql });
    } catch (e) {
      return Response.json({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },
};
`.trim();
}
