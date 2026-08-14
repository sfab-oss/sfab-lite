import { drizzle } from "drizzle-orm/d1";
// biome-ignore lint/performance/noNamespaceImport: drizzle's relational query builder takes the whole schema module as one object.
import * as schema from "./schema.js";

/** The factory's own D1. Never an app's data — see `schema.ts`. */
export function createDb(env: Env) {
  return drizzle(env.DB, { schema });
}

export type Db = ReturnType<typeof createDb>;
