import { validator } from "hono/validator";
import type { z } from "zod";
import { flattenError } from "zod";

/**
 * Validate a JSON body against a Zod schema so `hc` sees request types.
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

export function queryParams<T extends z.ZodType>(schema: T) {
  return validator("query", (value, c) => {
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
