import { validator } from "hono/validator";
import type { z } from "zod";
import { flattenError } from "zod";

/**
 * Validate a JSON body against a Zod schema so `hc` sees request types.
 */
export function jsonBody<Output>(schema: z.ZodType<Output>) {
  return validator("json", (value, c) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        { error: "invalid" as const, details: flattenError(parsed.error) },
        400
      );
    }
    return parsed.data;
  });
}

export function queryParams<Output>(schema: z.ZodType<Output>) {
  return validator("query", (value, c) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        { error: "invalid" as const, details: flattenError(parsed.error) },
        400
      );
    }
    return parsed.data;
  });
}
