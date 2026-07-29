import type { ContentfulStatusCode } from "hono/utils/http-status";

export interface ProtectedReply<
  T = unknown,
  S extends ContentfulStatusCode = ContentfulStatusCode,
> {
  status: S;
  body: T;
}

export function protectedError(
  error: string,
  status: 400 | 404 | 409 | 500 = 400
): ProtectedReply<{ ok: false; error: string }, typeof status> {
  return { status, body: { ok: false as const, error } };
}
