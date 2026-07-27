import { hc } from "hono/client";
import type { AppType } from "../../hono";
import { publicBase } from "./public-base";

/**
 * Typed client for this app's own API, inferred from the Hono app — change a
 * route and the call sites here stop compiling. Use it instead of `fetch`.
 *
 *   const res = await api.api.entities.$get();
 *   const { entities } = await res.json();
 */
export const api = hc<AppType>(publicBase ?? "/");
