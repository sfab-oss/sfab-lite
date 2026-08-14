import type { Auth } from "../auth";
import type { Db } from "../db";
import type { Env } from "../env";

export interface AppEnv {
  Bindings: Env;
  Variables: {
    auth: Auth;
    db: Db;
    /** Set by `requireOrg`; only read on routes mounted behind it. */
    orgId: string;
  };
}
