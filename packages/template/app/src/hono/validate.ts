import { validator } from "hono/validator";
import type { z } from "zod";
import { flattenError } from "zod";

/**
 * Validate a JSON body against a Zod schema.
 *
 * Worth the ten lines: it is what makes the typed client work. A route that
 * parses its body by hand is opaque to `hc`, so the SPA gets no types for
 * what it may send; declaring the schema here means a bad request body is a
 * compile error in the UI, and a 400 with field details at runtime.
 *
 *   .post("/", jsonBody(noteCreateSchema), (c) => {
 *     const input = c.req.valid("json");   // typed
 *   })
 */
export function jsonBody<T extends z.ZodType>(schema: T) {
  return validator("json", (value, c) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        { error: "invalid" as const, details: flattenError(parsed.error) },
        400
      );
    }
    return parsed.data as z.infer<T>;
  });
}
