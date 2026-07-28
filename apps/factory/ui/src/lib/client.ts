import { hc } from "hono/client";
import type { AppType } from "../../../src/hono";

/**
 * Typed `/admin` client inferred from `adminApp`. Credentials ride every
 * call so session cookies reach the actor middleware.
 */
export const client = hc<AppType>("/admin", {
  fetch: (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, {
      ...init,
      credentials: "include",
    }),
});
