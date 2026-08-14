import { hc } from "hono/client";
import type { ApiType } from "../../generated/api";
import { publicBase } from "./public-base";

/**
 * Typed client for this app's own API, inferred from the generated snapshot
 * (`src/generated/api.d.ts`) rather than `typeof` the live server.
 *
 *   const res = await client.protected.entities.$get();
 *   const { data } = await res.json();
 *
 * Base is `{publicBase}/api` when the factory mounts the app under a path
 * prefix, otherwise `/api`. That matches how the worker and factory strip
 * only the app prefix and leave `/api/...` for Hono.
 */
export const client = hc<ApiType>(publicBase ? `${publicBase}/api` : "/api");
