import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../env";
// biome-ignore lint/performance/noNamespaceImport: drizzle's relational query builder takes the whole schema module as one object.
import * as schema from "./schema";

export function createDb(env: Env) {
  return drizzle(env.DB, { schema });
}

export type Db = ReturnType<typeof createDb>;
