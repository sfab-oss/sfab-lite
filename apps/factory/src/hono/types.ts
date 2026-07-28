import type { Db } from "../db/index.js";
import type { Actor } from "../tenancy.js";

export interface AdminEnv {
  Bindings: Env;
  Variables: {
    db: Db;
    actor: Actor;
    organizationId?: string;
    appId?: string;
    attemptId?: string;
  };
}
