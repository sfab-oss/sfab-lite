import { z } from "zod";

export class InvalidRequestError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "InvalidRequestError";
    this.field = field;
  }
}

export const filesSchema = z.record(
  z.string(),
  z.string({ error: "body.files (path→content) required" }),
  { error: "body.files (path→content) required" }
);

export const appIdSchema = z
  .string({ error: "body.appId required" })
  .min(1, { error: "body.appId required" });

export function parseRequest<T>(schema: z.ZodType<T>, value: unknown): T {
  const body =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  const result = schema.safeParse(body);
  if (!result.success) {
    throw invalidFromZod(result.error);
  }
  return result.data;
}

function invalidFromZod(error: z.ZodError): InvalidRequestError {
  const issue = error.issues[0];
  if (!issue) {
    return new InvalidRequestError("", "invalid request");
  }
  const field = issue.path[0] == null ? "" : String(issue.path[0]);
  return new InvalidRequestError(field, issue.message);
}
