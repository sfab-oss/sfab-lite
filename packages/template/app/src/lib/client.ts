import { hc } from "hono/client";
import type { ApiType } from "../hono";
import { publicBase } from "./public-base";

/**
 * Typed client for this app's own API, inferred from the Hono tree under
 * `/api`. Change a route and the call sites here stop compiling.
 *
 *   const res = await client.protected.entities.$get();
 *   const { data } = await res.json();
 *
 * Base is `{publicBase}/api` when the factory mounts the app under a path
 * prefix, otherwise `/api`. That matches how the worker and factory strip
 * only the app prefix and leave `/api/...` for Hono.
 */
export const client = hc<ApiType>(publicBase ? `${publicBase}/api` : "/api");
