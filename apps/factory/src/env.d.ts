import type { AppDO } from "./app-do.js";

declare global {
  interface Env {
    LOADER: WorkerLoader;
    APP_DO: DurableObjectNamespace<AppDO>;
    /** Service binding → sfab-lite-check */
    CHECK: Fetcher;
    /** Service binding → sfab-lite-lint */
    LINT: Fetcher;
    BETTER_AUTH_SECRET?: string;
    /** When set, all `/admin/*` require matching `X-Admin-Token`. */
    ADMIN_TOKEN?: string;
  }
}
