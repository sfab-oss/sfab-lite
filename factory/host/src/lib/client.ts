import { hc } from "hono/client";
import type { AppType } from "../hono";

/**
 * Typed `/api` client inferred from the Hono `app`. Credentials ride every
 * call so session cookies reach protected actor middleware.
 */
export const client = hc<AppType>("/api", {
  fetch: (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, {
      ...init,
      credentials: "include",
    }),
});
