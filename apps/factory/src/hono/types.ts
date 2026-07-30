import type { Db } from "../db/index.js";
import type { Actor } from "./tenancy.js";

export interface ApiEnv {
  Bindings: Env;
}

export interface AdminEnv extends ApiEnv {
  Variables: {
    db: Db;
    actor: Actor;
    organizationId?: string;
    appId?: string;
    attemptId?: string;
  };
}
