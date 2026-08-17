import { drizzle } from "drizzle-orm/d1";
// biome-ignore lint/performance/noNamespaceImport: drizzle's relational query builder takes the whole schema module as one object.
import * as schema from "./schema";

export interface DbEnv {
  DB: D1Database;
}

export function createDb(env: DbEnv) {
  return drizzle(env.DB, { schema });
}

export type Db = ReturnType<typeof createDb>;
